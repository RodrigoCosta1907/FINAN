"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { parseMoneyInput } from "@/lib/money";

export type TxState = { error?: string; ok?: boolean };

const base = z.object({
  kind: z.enum(["income", "expense"]),
  description: z.string().trim().min(1, "Informe a descrição.").max(120),
  amount: z.string().min(1, "Informe o valor."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  accountId: z.string().uuid("Escolha a conta."),
  categoryId: z.string().optional(),
  personId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

function revalidateAll() {
  for (const path of ["/", "/transacoes", "/receitas", "/despesas", "/contas"]) {
    revalidatePath(path);
  }
}

export async function createTransaction(_prev: TxState, formData: FormData): Promise<TxState> {
  const parsed = base.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    accountId: formData.get("accountId"),
    categoryId: (formData.get("categoryId") as string) || undefined,
    personId: (formData.get("personId") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const amountCents = parseMoneyInput(parsed.data.amount);
  if (!amountCents) return { error: "Valor inválido. Ex.: 25,90" };

  const user = await requireUser();
  const householdId = await ensureHousehold(user);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_create_transaction", {
    p_household: householdId,
    p_kind: parsed.data.kind,
    p_description: parsed.data.description,
    p_amount: amountCents,
    p_date: parsed.data.date,
    p_account: parsed.data.accountId,
    p_category: parsed.data.categoryId ?? null,
    p_subcategory: null,
    p_paid_by: parsed.data.personId ?? null,
    p_payment: null,
    p_splits: null,
    p_is_shared: false,
    p_due_date: null,
    p_notes: parsed.data.notes ?? null,
    p_tags: [],
  });

  if (error) return { error: `Não foi possível salvar: ${error.message}` };

  revalidateAll();
  redirect("/transacoes?ok=1");
}

export async function cancelTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_cancel_transaction", {
    p_txn: id,
    p_reason: "cancelado pela lista de transações",
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function duplicateTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("account_transactions")
    .select("description, amount_cents, kind, account_id, category_id, subcategory_id, paid_by_person_id, notes, is_shared")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) throw new Error(error?.message ?? "lançamento não encontrado");

  const user = await requireUser();
  const householdId = await ensureHousehold(user);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { error: insertError } = await supabase.rpc("fin_create_transaction", {
    p_household: householdId,
    p_kind: row.kind as "income" | "expense",
    p_description: `${row.description} (cópia)`,
    p_amount: Number(row.amount_cents),
    p_date: today,
    p_account: row.account_id,
    p_category: row.category_id,
    p_subcategory: row.subcategory_id,
    p_paid_by: row.paid_by_person_id,
    p_payment: null,
    p_splits: null,
    p_is_shared: false,
    p_due_date: null,
    p_notes: row.notes,
    p_tags: [],
  });

  if (insertError) throw new Error(insertError.message);

  revalidateAll();
}

export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("account_transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidateAll();
}
