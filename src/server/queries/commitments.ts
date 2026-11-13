import { createClient } from "@/lib/supabase/server";

export type CardRow = {
  id: string;
  name: string;
  institution: string | null;
  limitCents: number;
  usedCents: number;
  availableCents: number;
  closingDay: number;
  dueDay: number;
  accountId: string | null;
};

export type InvoiceRow = {
  id: string;
  cardName: string;
  period: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  status: string;
};

export type PurchaseRow = {
  id: string;
  description: string;
  cardName: string;
  totalCents: number;
  installments: number;
  paidInstallments: number;
  firstDue: string;
  lastDue: string;
  status: string;
};

export type BillRow = {
  id: string;
  description: string;
  amountCents: number;
  paidCents: number;
  dueDate: string;
  status: string;
  categoryName: string | null;
};

export type ReceivableRow = {
  id: string;
  description: string;
  amountCents: number;
  receivedCents: number;
  expectedDate: string;
  status: string;
  personName: string | null;
};

export type RecurringRow = {
  id: string;
  description: string;
  kind: string;
  amountCents: number;
  frequency: string;
  startDate: string;
  isActive: boolean;
  occurrences: number;
};

export async function getCards() {
  const supabase = await createClient();
  const [cards, usage, invoices, accounts] = await Promise.all([
    supabase.from("credit_cards").select("id, name, institution, limit_cents, closing_day, due_day, payment_account_id, is_active").eq("is_active", true).order("name"),
    supabase.from("v_card_usage").select("card_id, used_cents, available_cents"),
    supabase
      .from("credit_card_invoices")
      .select("id, card_id, period_year, period_month, due_date, total_cents, paid_cents, status")
      .in("status", ["open", "closed", "partially_paid", "overdue"])
      .order("due_date"),
    supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("created_at"),
  ]);

  const usageMap = new Map((usage.data ?? []).map((u) => [u.card_id, u]));
  const nameMap = new Map((cards.data ?? []).map((c) => [c.id, c.name]));

  const cardsOut: CardRow[] = (cards.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    institution: c.institution,
    limitCents: Number(c.limit_cents),
    usedCents: Number(usageMap.get(c.id)?.used_cents ?? 0),
    availableCents: Number(usageMap.get(c.id)?.available_cents ?? c.limit_cents),
    closingDay: c.closing_day,
    dueDay: c.due_day,
    accountId: c.payment_account_id,
  }));

  const invoicesOut: InvoiceRow[] = (invoices.data ?? []).map((i) => ({
    id: i.id,
    cardName: nameMap.get(i.card_id) ?? "Cartão",
    period: `${String(i.period_month).padStart(2, "0")}/${i.period_year}`,
    dueDate: i.due_date,
    totalCents: Number(i.total_cents),
    paidCents: Number(i.paid_cents),
    status: i.status,
  }));

  return { cards: cardsOut, invoices: invoicesOut, accounts: accounts.data ?? [] };
}

export async function getPurchases() {
  const supabase = await createClient();
  const [purchases, cards] = await Promise.all([
    supabase
      .from("credit_card_purchases")
      .select("id, description, card_id, total_cents, installments_count, first_due_date, status")
      .order("purchase_date", { ascending: false })
      .limit(50),
    supabase.from("credit_cards").select("id, name"),
  ]);

  const cardNames = new Map((cards.data ?? []).map((c) => [c.id, c.name]));
  const ids = (purchases.data ?? []).map((p) => p.id);

  const installments = ids.length
    ? await supabase.from("installments").select("purchase_id, number, amount_cents, due_date, status").in("purchase_id", ids)
    : { data: [] as { purchase_id: string; number: number; amount_cents: number; due_date: string; status: string }[] };

  const byPurchase = new Map<string, { paid: number; total: number; lastDue: string }>();
  for (const inst of installments.data ?? []) {
    const entry = byPurchase.get(inst.purchase_id) ?? { paid: 0, total: 0, lastDue: inst.due_date };
    entry.total += 1;
    if (inst.status === "paid" || inst.status === "anticipated") entry.paid += 1;
    if (inst.due_date > entry.lastDue) entry.lastDue = inst.due_date;
    byPurchase.set(inst.purchase_id, entry);
  }

  const rows: PurchaseRow[] = (purchases.data ?? []).map((p) => {
    const agg = byPurchase.get(p.id) ?? { paid: 0, total: p.installments_count, lastDue: p.first_due_date };
    return {
      id: p.id,
      description: p.description,
      cardName: cardNames.get(p.card_id) ?? "Cartão",
      totalCents: Number(p.total_cents),
      installments: Number(p.installments_count),
      paidInstallments: agg.paid,
      firstDue: p.first_due_date,
      lastDue: agg.lastDue,
      status: p.status,
    };
  });

  return rows;
}

export async function getBills() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bills")
    .select("id, description, amount_cents, paid_cents, due_date, status, category_id")
    .in("status", ["pending", "partially_paid", "overdue"])
    .order("due_date")
    .limit(100);

  const categoryIds = [...new Set((data ?? []).map((b) => b.category_id).filter(Boolean))] as string[];
  const categories = categoryIds.length
    ? await supabase.from("categories").select("id, name").in("id", categoryIds)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

  return (data ?? []).map<BillRow>((b) => ({
    id: b.id,
    description: b.description,
    amountCents: Number(b.amount_cents),
    paidCents: Number(b.paid_cents),
    dueDate: b.due_date,
    status: b.status,
    categoryName: b.category_id ? (names.get(b.category_id) ?? null) : null,
  }));
}

export async function getReceivables() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receivables")
    .select("id, description, amount_cents, received_cents, expected_date, status, person_id")
    .in("status", ["pending", "partially_paid", "overdue"])
    .order("expected_date")
    .limit(100);

  const personIds = [...new Set((data ?? []).map((r) => r.person_id).filter(Boolean))] as string[];
  const people = personIds.length
    ? await supabase.from("people").select("id, name").in("id", personIds)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((people.data ?? []).map((p) => [p.id, p.name]));

  return (data ?? []).map<ReceivableRow>((r) => ({
    id: r.id,
    description: r.description,
    amountCents: Number(r.amount_cents),
    receivedCents: Number(r.received_cents),
    expectedDate: r.expected_date,
    status: r.status,
    personName: r.person_id ? (names.get(r.person_id) ?? null) : null,
  }));
}

export async function getRecurring() {
  const supabase = await createClient();
  const [rules, occurrences] = await Promise.all([
    supabase
      .from("recurring_rules")
      .select("id, description, kind, amount_cents, frequency, start_date, is_active")
      .order("created_at", { ascending: false }),
    supabase.from("recurring_occurrences").select("rule_id"),
  ]);

  const counts = new Map<string, number>();
  for (const occurrence of occurrences.data ?? []) {
    counts.set(occurrence.rule_id, (counts.get(occurrence.rule_id) ?? 0) + 1);
  }

  return (rules.data ?? []).map<RecurringRow>((r) => ({
    id: r.id,
    description: r.description,
    kind: r.kind,
    amountCents: Number(r.amount_cents),
    frequency: r.frequency,
    startDate: r.start_date,
    isActive: r.is_active,
    occurrences: counts.get(r.id) ?? 0,
  }));
}
