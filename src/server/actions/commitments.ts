"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { parseMoneyInput } from "@/lib/money";
import { todayInSaoPaulo } from "@/server/queries/transactions";

export type FormState = { error?: string; ok?: boolean };

function revalidateAll() {
  for (const path of ["/", "/cartoes", "/compras-parceladas", "/contas-a-pagar", "/contas-a-receber", "/recorrencias"]) {
    revalidatePath(path);
  }
}

async function context() {
  const user = await requireUser();
  const householdId = await ensureHousehold(user);
  const supabase = await createClient();
  return { supabase, householdId, user };
}

// ------------------------------------------------------------------ cartões --
const cardSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cartão.").max(40),
  institution: z.string().max(40).optional(),
  limit: z.string().min(1, "Informe o limite."),
  closingDay: z.coerce.number().int().min(1).max(28),
  dueDay: z.coerce.number().int().min(1).max(28),
  accountId: z.string().uuid().optional(),
});

export async function createCard(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = cardSchema.safeParse({
    name: formData.get("name"),
    institution: (formData.get("institution") as string) || undefined,
    limit: formData.get("limit"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
    accountId: (formData.get("accountId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const limitCents = parseMoneyInput(parsed.data.limit);
  if (!limitCents) return { error: "Limite inválido." };

  const { supabase, householdId } = await context();
  const { error } = await supabase.from("credit_cards").insert({
    household_id: householdId,
    name: parsed.data.name,
    institution: parsed.data.institution ?? null,
    limit_cents: limitCents,
    closing_day: parsed.data.closingDay,
    due_day: parsed.data.dueDay,
    payment_account_id: parsed.data.accountId ?? null,
  });

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

const purchaseSchema = z.object({
  cardId: z.string().uuid("Escolha o cartão."),
  description: z.string().trim().min(2, "Informe a descrição.").max(80),
  total: z.string().min(1, "Informe o valor."),
  installments: z.coerce.number().int().min(1).max(60),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid().optional(),
});

export async function createPurchase(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = purchaseSchema.safeParse({
    cardId: formData.get("cardId"),
    description: formData.get("description"),
    total: formData.get("total"),
    installments: formData.get("installments"),
    purchaseDate: formData.get("purchaseDate"),
    firstDue: formData.get("firstDue"),
    categoryId: (formData.get("categoryId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const totalCents = parseMoneyInput(parsed.data.total);
  if (!totalCents) return { error: "Valor inválido." };

  const { supabase, householdId } = await context();
  const { error } = await supabase.rpc("fin_create_installment_purchase", {
    p_household: householdId,
    p_card: parsed.data.cardId,
    p_description: parsed.data.description,
    p_total_cents: totalCents,
    p_installments: parsed.data.installments,
    p_purchase_date: parsed.data.purchaseDate,
    p_first_due_date: parsed.data.firstDue,
    p_category: parsed.data.categoryId ?? null,
    p_responsible: null,
    p_is_shared: false,
    p_merchant: null,
    p_notes: null,
  });

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function payInvoice(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  if (!invoiceId || !accountId || !amount) throw new Error("dados do pagamento incompletos");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_pay_card_invoice", {
    p_invoice: invoiceId,
    p_account: accountId,
    p_amount: amount,
    p_paid_on: todayInSaoPaulo(),
    p_notes: "pagamento pela tela de cartões",
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function closeInvoice(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_close_invoice", { p_invoice: invoiceId });
  if (error) throw new Error(error.message);
  revalidateAll();
}

// -------------------------------------------------------------------- contas --
const billSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(80),
  amount: z.string().min(1, "Informe o valor."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
});

export async function createBill(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = billSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
    categoryId: (formData.get("categoryId") as string) || undefined,
    accountId: (formData.get("accountId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const amountCents = parseMoneyInput(parsed.data.amount);
  if (!amountCents) return { error: "Valor inválido." };

  const { supabase, householdId } = await context();
  const { error } = await supabase.from("bills").insert({
    household_id: householdId,
    description: parsed.data.description,
    amount_cents: amountCents,
    due_date: parsed.data.dueDate,
    competence_date: parsed.data.dueDate,
    category_id: parsed.data.categoryId ?? null,
    account_id: parsed.data.accountId ?? null,
    status: "pending",
  });

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function payBill(formData: FormData) {
  const billId = String(formData.get("billId") ?? "");
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  const accountId = String(formData.get("accountId") ?? "");
  if (!billId || !amount) throw new Error("dados do pagamento incompletos");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_pay_bill", {
    p_bill: billId,
    p_amount: amount,
    p_paid_on: todayInSaoPaulo(),
    p_account: accountId || null,
    p_notes: "pagamento pela tela de contas a pagar",
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}

const receivableSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(80),
  amount: z.string().min(1, "Informe o valor."),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personId: z.string().uuid().optional(),
});

export async function createReceivable(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = receivableSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    expectedDate: formData.get("expectedDate"),
    personId: (formData.get("personId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const amountCents = parseMoneyInput(parsed.data.amount);
  if (!amountCents) return { error: "Valor inválido." };

  const { supabase, householdId } = await context();
  const { error } = await supabase.from("receivables").insert({
    household_id: householdId,
    description: parsed.data.description,
    amount_cents: amountCents,
    expected_date: parsed.data.expectedDate,
    person_id: parsed.data.personId ?? null,
    status: "pending",
  });

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function receiveReceivable(formData: FormData) {
  const id = String(formData.get("receivableId") ?? "");
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  const accountId = String(formData.get("accountId") ?? "");
  if (!id || !amount) throw new Error("dados do recebimento incompletos");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_receive_receivable", {
    p_receivable: id,
    p_amount: amount,
    p_received_on: todayInSaoPaulo(),
    p_account: accountId || null,
    p_notes: "recebimento pela tela de contas a receber",
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}

// -------------------------------------------------------------- recorrências --
const recurringSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(80),
  kind: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Informe o valor."),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "yearly"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
});

export async function createRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = recurringSchema.safeParse({
    description: formData.get("description"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    categoryId: (formData.get("categoryId") as string) || undefined,
    accountId: (formData.get("accountId") as string) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const amountCents = parseMoneyInput(parsed.data.amount);
  if (!amountCents) return { error: "Valor inválido." };

  const { supabase, householdId } = await context();
  const { error } = await supabase.from("recurring_rules").insert({
    household_id: householdId,
    description: parsed.data.description,
    kind: parsed.data.kind,
    amount_cents: amountCents,
    frequency: parsed.data.frequency,
    start_date: parsed.data.startDate,
    category_id: parsed.data.categoryId ?? null,
    account_id: parsed.data.accountId ?? null,
  });

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function materializeRecurring() {
  const { supabase, householdId } = await context();
  const until = new Date();
  until.setDate(until.getDate() + 60);
  const iso = until.toISOString().slice(0, 10);

  const { error } = await supabase.rpc("fin_materialize_recurring", {
    p_household: householdId,
    p_until: iso,
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}
