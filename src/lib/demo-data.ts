/**
 * DADOS DE DEMONSTRAÇÃO — não são dados reais do usuário.
 * Existem apenas para validar layout, gráficos e cálculos enquanto o projeto
 * Supabase não está conectado. Toda a tela marcada com `isDemo` exibe o aviso.
 * Em produção este arquivo é substituído pelas queries de `src/server/queries`.
 */

export const isDemo = true;

export type MonthPoint = {
  key: string;
  label: string;
  income: number;
  expense: number;
  invested: number;
  result: number;
};

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const INCOME = [
  1180000, 1180000, 1240000, 1190000, 1260000, 1250000,
  1300000, 1280000, 1310000, 1295000, 1250000, 1340000,
];

const EXPENSE = [
  980000, 1020000, 940000, 1060000, 1010000, 890000,
  1120000, 1080000, 990000, 870000, 812340, 940000,
];

const INVESTED = [
  200000, 200000, 250000, 150000, 300000, 250000,
  400000, 350000, 300000, 420000, 450000, 500000,
];

export const evolution: MonthPoint[] = MONTH_LABELS.map((label, i) => {
  const income = INCOME[i] ?? 0;
  const expense = EXPENSE[i] ?? 0;
  return {
    key: `2026-${String(i + 1).padStart(2, "0")}`,
    label,
    income,
    expense,
    invested: INVESTED[i] ?? 0,
    result: income - expense,
  };
});

export type CategorySlice = {
  id: string;
  name: string;
  color: string;
  spent: number;
  budget: number;
};

export const categories: CategorySlice[] = [
  { id: "moradia", name: "Moradia", color: "#2563EB", spent: 245000, budget: 260000 },
  { id: "alimentacao", name: "Alimentação", color: "#F59E0B", spent: 186000, budget: 200000 },
  { id: "transporte", name: "Transporte", color: "#0EA5E9", spent: 78000, budget: 90000 },
  { id: "outros", name: "Outros", color: "#94A3B8", spent: 121340, budget: 150000 },
  { id: "lazer", name: "Lazer", color: "#EC4899", spent: 54000, budget: 60000 },
  { id: "educacao", name: "Educação", color: "#8B5CF6", spent: 60000, budget: 70000 },
  { id: "saude", name: "Saúde", color: "#EF4444", spent: 42000, budget: 50000 },
  { id: "assinaturas", name: "Assinaturas", color: "#6366F1", spent: 26000, budget: 40000 },
];

export type BillStatus = "pending" | "closed" | "overdue";

export type UpcomingBill = {
  id: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
};

/** `today` fixo para a demonstração ser determinística (sem divergir no SSR). */
export const demoToday = "2026-11-12";

export const upcomingBills: UpcomingBill[] = [
  { id: "b1", description: "Condomínio", category: "Moradia", amount: 92000, dueDate: "2026-11-10", status: "overdue" },
  { id: "b2", description: "Aluguel", category: "Moradia", amount: 245000, dueDate: "2026-11-15", status: "pending" },
  { id: "b3", description: "Fatura Nubank", category: "Cartão", amount: 186420, dueDate: "2026-11-18", status: "closed" },
  { id: "b4", description: "Energia elétrica", category: "Moradia", amount: 38900, dueDate: "2026-11-20", status: "pending" },
  { id: "b5", description: "Internet fibra", category: "Assinaturas", amount: 12990, dueDate: "2026-11-22", status: "pending" },
  { id: "b6", description: "Academia", category: "Saúde", amount: 14900, dueDate: "2026-11-28", status: "pending" },
];

export const insights = [
  {
    id: "i1",
    tone: "warning" as const,
    title: "Alimentação subiu 18% em relação a outubro",
    detail: "R$ 1.860,00 gastos no mês contra R$ 1.576,27 no anterior.",
  },
  {
    id: "i2",
    tone: "info" as const,
    title: "R$ 2.450,00 em parcelas previstas para dezembro",
    detail: "Comprometimento de 19,6% da renda média dos últimos 3 meses.",
  },
  {
    id: "i3",
    tone: "danger" as const,
    title: "1 conta vencida há 2 dias",
    detail: "Condomínio de R$ 920,00 — marque como pago ou reagende.",
  },
  {
    id: "i4",
    tone: "success" as const,
    title: "Reserva de emergência em 4,2 meses",
    detail: "Faltam R$ 1.800,00 para atingir a meta de 6 meses.",
  },
];

export type KpiKey =
  | "balance"
  | "income"
  | "expense"
  | "result"
  | "bills"
  | "invoices"
  | "investments"
  | "netWorth";

export type Kpi = {
  key: KpiKey;
  value: number;
  change: number | null;
  hint: string;
};

/** KPIs do mês selecionado (índice 0..11), derivados da mesma série do gráfico. */
export function kpisFor(monthIndex: number): Record<KpiKey, Kpi> {
  const point = evolution[monthIndex] ?? evolution[0]!;
  const prev = evolution[monthIndex - 1];

  const pct = (current: number, previous: number | undefined) => {
    if (!previous) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  };

  const balance = 1832450 + (point.result - 437660);
  const bills = 214580;
  const invoices = 186420;
  const investments = 4827000 + point.invested * 2;
  const receivables = 0;

  return {
    balance: {
      key: "balance",
      value: balance,
      change: pct(point.result, prev?.result),
      hint: "2 contas ativas",
    },
    income: {
      key: "income",
      value: point.income,
      change: pct(point.income, prev?.income),
      hint: "recebidas no mês",
    },
    expense: {
      key: "expense",
      value: point.expense,
      change: pct(point.expense, prev?.expense),
      hint: "competência do mês",
    },
    result: {
      key: "result",
      value: point.income - point.expense,
      change: pct(point.income - point.expense, prev ? prev.income - prev.expense : undefined),
      hint: "receitas − despesas",
    },
    bills: { key: "bills", value: bills, change: null, hint: "6 contas em aberto" },
    invoices: { key: "invoices", value: invoices, change: null, hint: "vence em 18/11" },
    investments: { key: "investments", value: investments, change: 3.4, hint: "R$ 312,00 de rendimentos" },
    netWorth: {
      key: "netWorth",
      value: investments + balance + 1490000 + receivables - invoices - bills,
      change: 2.1,
      hint: "ativos − passivos",
    },
  };
}

export const indicators = {
  savingsRate: 35.0,
  incomeCommitment: 65.0,
  fixedExpenses: 512140,
  variableExpenses: 300200,
  futureInstallments: 245000,
  emergencyMonths: 4.2,
  netWorthChange: 2.1,
};

export const healthScore = {
  score: 78,
  label: "Boa",
  components: [
    { name: "Comprometimento da renda", weight: 30, points: 21 },
    { name: "Taxa de poupança", weight: 25, points: 22 },
    { name: "Reserva de emergência", weight: 20, points: 14 },
    { name: "Endividamento", weight: 15, points: 12 },
    { name: "Pagamentos em dia", weight: 10, points: 9 },
  ],
};
