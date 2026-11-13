import { createClient } from "@/lib/supabase/server";

export type TxKind = "income" | "expense";
export type TxStatus = "pending" | "posted" | "reconciled" | "canceled";

export type TxRow = {
  id: string;
  description: string;
  amountCents: number;
  kind: string;
  status: string;
  date: string;
  accountName: string;
  categoryName: string;
  categoryColor: string;
  isShared: boolean;
  personName: string | null;
  notes: string | null;
};

export type TxFilters = {
  from: string;
  to: string;
  kind?: TxKind;
  accountId?: string;
  categoryId?: string;
  q?: string;
  page: number;
};

export type TxPage = {
  rows: TxRow[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
  incomeCents: number;
  expenseCents: number;
};

export const PER_PAGE = 25;

export function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function listTransactions(filters: TxFilters): Promise<TxPage> {
  const supabase = await createClient();
  const fromIndex = (filters.page - 1) * PER_PAGE;

  let query = supabase
    .from("account_transactions")
    .select("id, description, amount_cents, kind, status, occurred_on, competence_date, paid_at, account_id, category_id, is_shared, paid_by_person_id, notes", {
      count: "exact",
    })
    .gte("occurred_on", filters.from)
    .lte("occurred_on", filters.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIndex, fromIndex + PER_PAGE - 1);

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.q) query = query.ilike("description", `%${filters.q}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(`listar transações: ${error.message}`);

  const rows = data ?? [];

  // nomes de apoio (evita depender de embed com FK composta)
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))] as string[];
  const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))] as string[];
  const personIds = [...new Set(rows.map((r) => r.paid_by_person_id).filter(Boolean))] as string[];

  const [accounts, categories, people] = await Promise.all([
    accountIds.length
      ? supabase.from("financial_accounts").select("id, name").in("id", accountIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length
      ? supabase.from("categories").select("id, name, color").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string; color: string }[] }),
    personIds.length
      ? supabase.from("people").select("id, name").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const accountMap = new Map((accounts.data ?? []).map((a) => [a.id, a.name]));
  const categoryMap = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const personMap = new Map((people.data ?? []).map((p) => [p.id, p.name]));

  // totais do período filtrado (não só da página)
  let totalsQuery = supabase
    .from("account_transactions")
    .select("kind, amount_cents")
    .gte("occurred_on", filters.from)
    .lte("occurred_on", filters.to)
    .neq("status", "canceled")
    .limit(5000);
  if (filters.kind) totalsQuery = totalsQuery.eq("kind", filters.kind);
  if (filters.accountId) totalsQuery = totalsQuery.eq("account_id", filters.accountId);
  if (filters.categoryId) totalsQuery = totalsQuery.eq("category_id", filters.categoryId);
  if (filters.q) totalsQuery = totalsQuery.ilike("description", `%${filters.q}%`);

  const { data: totals } = await totalsQuery;
  const incomeCents = (totals ?? [])
    .filter((r) => r.kind === "income")
    .reduce((acc, r) => acc + Number(r.amount_cents), 0);
  const expenseCents = (totals ?? [])
    .filter((r) => r.kind === "expense")
    .reduce((acc, r) => acc + Number(r.amount_cents), 0);

  return {
    rows: rows.map((r) => {
      const category = r.category_id ? categoryMap.get(r.category_id) : undefined;
      return {
        id: r.id,
        description: r.description,
        amountCents: Number(r.amount_cents),
        kind: r.kind,
        status: r.status,
        date: r.occurred_on ?? r.competence_date,
        accountName: (r.account_id && accountMap.get(r.account_id)) || "—",
        categoryName: category?.name ?? "Sem categoria",
        categoryColor: category?.color ?? "#94A3B8",
        isShared: Boolean(r.is_shared),
        personName: r.paid_by_person_id ? (personMap.get(r.paid_by_person_id) ?? null) : null,
        notes: r.notes,
      };
    }),
    total: count ?? 0,
    page: filters.page,
    perPage: PER_PAGE,
    pages: Math.max(1, Math.ceil((count ?? 0) / PER_PAGE)),
    incomeCents,
    expenseCents,
  };
}

export type Option = { id: string; name: string; kind?: string; color?: string };

export async function getFormOptions(): Promise<{
  accounts: Option[];
  categories: Option[];
  people: Option[];
}> {
  const supabase = await createClient();
  const [accounts, categories, people] = await Promise.all([
    supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("created_at"),
    supabase.from("categories").select("id, name, kind, color").eq("is_active", true).order("sort_order"),
    supabase.from("people").select("id, name").eq("is_active", true).order("created_at"),
  ]);

  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    people: people.data ?? [],
  };
}
