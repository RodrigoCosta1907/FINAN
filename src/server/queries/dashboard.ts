import { createClient } from "@/lib/supabase/server";

export type Summary = {
  balance_cents: number;
  income_cents: number;
  expense_cents: number;
  result_cents: number;
  income_prev_cents: number;
  expense_prev_cents: number;
  income_change_pct: number | null;
  expense_change_pct: number | null;
  bills_open_cents: number;
  card_invoices_open_cents: number;
  investments_cents: number;
  net_worth_cents: number;
  future_installments_cents: number;
  fixed_expenses_cents: number;
  variable_expenses_cents: number;
  savings_rate_pct: number | null;
  income_commitment_pct: number | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  spent: number;
  budget: number;
};

export type BillRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: "pending" | "partially_paid" | "overdue";
};

export type MonthRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  invested: number;
  result: number;
};

export type HealthData = {
  score: number;
  components: { name: string; weight: number; points: number }[];
};

export type DashboardData = {
  summary: Summary;
  categories: CategoryRow[];
  bills: BillRow[];
  months: MonthRow[];
  health: HealthData | null;
  hasData: boolean;
};

const EMPTY_SUMMARY: Summary = {
  balance_cents: 0,
  income_cents: 0,
  expense_cents: 0,
  result_cents: 0,
  income_prev_cents: 0,
  expense_prev_cents: 0,
  income_change_pct: null,
  expense_change_pct: null,
  bills_open_cents: 0,
  card_invoices_open_cents: 0,
  investments_cents: 0,
  net_worth_cents: 0,
  future_installments_cents: 0,
  fixed_expenses_cents: 0,
  variable_expenses_cents: 0,
  savings_rate_pct: null,
  income_commitment_pct: null,
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export async function getDashboardData(
  householdId: string,
  year: number,
  month: number,
): Promise<DashboardData> {
  const supabase = await createClient();
  const period = monthKey(year, month);

  const [summaryRes, categoriesRes, budgetsRes, billsRes, monthsRes, healthRes] =
    await Promise.all([
      supabase.rpc("fin_dashboard_summary", {
        p_household: householdId,
        p_year: year,
        p_month: month,
        p_regime: "cash",
      }),
      supabase
        .from("v_category_spending")
        .select("category_id, category_name, color, spent_cents")
        .eq("period", period)
        .order("spent_cents", { ascending: false })
        .limit(8),
      supabase
        .from("v_budget_status")
        .select("category_id, limit_cents")
        .eq("period_year", year)
        .eq("period_month", month),
      supabase
        .from("bills")
        .select("id, description, amount_cents, due_date, status, categories(name)")
        .in("status", ["pending", "partially_paid", "overdue"])
        .order("due_date", { ascending: true })
        .limit(8),
      supabase
        .from("v_monthly_summary")
        .select("period, income_cents, expense_cents, result_cents, invested_cents")
        .lte("period", period)
        .order("period", { ascending: false })
        .limit(12),
      supabase.rpc("fin_health_score", {
        p_household: householdId,
        p_year: year,
        p_month: month,
      }),
    ]);

  const summary = (summaryRes.data as Summary | null) ?? EMPTY_SUMMARY;

  const budgetByCategory = new Map<string, number>();
  for (const row of budgetsRes.data ?? []) {
    if (row.category_id) budgetByCategory.set(row.category_id, Number(row.limit_cents ?? 0));
  }

  const categories: CategoryRow[] = (categoriesRes.data ?? []).map((row) => ({
    id: row.category_id,
    name: row.category_name ?? "Sem categoria",
    color: row.color ?? "#94A3B8",
    spent: Number(row.spent_cents ?? 0),
    budget: budgetByCategory.get(row.category_id) ?? 0,
  }));

  const bills: BillRow[] = (billsRes.data ?? []).map((row) => {
    const rel = row.categories as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
    return {
      id: row.id,
      description: row.description,
      category: name ?? "Sem categoria",
      amount: Number(row.amount_cents ?? 0),
      dueDate: row.due_date,
      status: row.status as BillRow["status"],
    };
  });

  const months: MonthRow[] = (monthsRes.data ?? [])
    .map((row) => {
      const [y, m] = String(row.period).split("-").map(Number);
      return {
        key: String(row.period),
        label: `${MONTHS[(m ?? 1) - 1]}/${String(y ?? "").slice(2)}`,
        income: Number(row.income_cents ?? 0),
        expense: Number(row.expense_cents ?? 0),
        invested: Number(row.invested_cents ?? 0),
        result: Number(row.result_cents ?? 0),
      };
    })
    .reverse();

  const rawHealth = healthRes.data as
    | { score?: number; components?: Record<string, { weight: number; points: number }> }
    | null;

  const health: HealthData | null = rawHealth?.score != null
    ? {
        score: Number(rawHealth.score),
        components: [
          { key: "commitment", name: "Comprometimento da renda" },
          { key: "savings", name: "Taxa de poupança" },
          { key: "emergency_fund", name: "Reserva de emergência" },
          { key: "debt", name: "Endividamento" },
          { key: "late_payments", name: "Pagamentos em dia" },
        ].map(({ key, name }) => ({
          name,
          weight: Number(rawHealth.components?.[key]?.weight ?? 0),
          points: Number(rawHealth.components?.[key]?.points ?? 0),
        })),
      }
    : null;

  const hasData =
    summary.income_cents > 0 ||
    summary.expense_cents > 0 ||
    months.length > 0 ||
    bills.length > 0;

  return { summary, categories, bills, months, health, hasData };
}
