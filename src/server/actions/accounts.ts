"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { parseMoneyInput } from "@/lib/money";

export type FormState = { error?: string; ok?: boolean };

const accountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da conta.").max(60),
  type: z.enum(["checking", "savings", "cash", "digital", "joint", "investment"]),
  institution: z.string().max(60).optional(),
  opening: z.string().optional(),
});

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    institution: (formData.get("institution") as string) || undefined,
    opening: (formData.get("opening") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const opening = parsed.data.opening ? parseMoneyInput(parsed.data.opening) : 0;
  if (opening === null) return { error: "Saldo inicial inválido." };

  const user = await requireUser();
  const householdId = await ensureHousehold(user);
  const supabase = await createClient();

  const { error } = await supabase.from("financial_accounts").insert({
    household_id: householdId,
    name: parsed.data.name,
    type: parsed.data.type,
    institution: parsed.data.institution ?? null,
    opening_balance_cents: opening,
    opening_date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  });

  if (error) return { error: `Não foi possível criar: ${error.message}` };

  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleAccount(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("financial_accounts")
    .update({ is_active: !active })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/contas");
  revalidatePath("/");
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(40),
  kind: z.enum(["income", "expense", "both"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  parentId: z.string().optional(),
});

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color"),
    parentId: (formData.get("parentId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const user = await requireUser();
  const householdId = await ensureHousehold(user);
  const supabase = await createClient();

  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    color: parsed.data.color,
    parent_id: parsed.data.parentId ?? null,
  });

  if (error) return { error: `Não foi possível criar: ${error.message}` };

  revalidatePath("/configuracoes");
  revalidatePath("/transacoes");
  return { ok: true };
}
