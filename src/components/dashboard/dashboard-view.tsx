import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Coins,
  CreditCard,
  Landmark,
  LineChart,
  PlusCircle,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { HealthScoreCard, IndicatorsCard, InsightsList, type Insight } from "@/components/dashboard/panels";
import { ExportButton } from "@/components/dashboard/export-button";
import { EvolutionChart } from "@/components/charts/evolution-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { formatBRL } from "@/lib/money";
import type { DashboardData } from "@/server/queries/dashboard";

function buildInsights(data: DashboardData): Insight[] {
  const { summary, categories, bills } = data;
  const items: Insight[] = [];

  if (summary.income_commitment_pct != null && summary.income_commitment_pct > 90) {
    items.push({
      id: "commitment",
      tone: "warning",
      title: `Despesas consomem ${summary.income_commitment_pct.toFixed(0)}% da renda`,
      detail: "Acima de 90% o espaço para imprevistos fica muito pequeno.",
    });
  }

  const biggest = categories[0];
  if (biggest) {
    const share = summary.expense_cents > 0 ? (biggest.spent / summary.expense_cents) * 100 : 0;
    items.push({
      id: "top-category",
      tone: "info",
      title: `${biggest.name} concentra ${share.toFixed(0)}% das despesas`,
      detail: `${formatBRL(biggest.spent)} no mês${biggest.budget > 0 ? ` — orçamento de ${formatBRL(biggest.budget)}` : ""}.`,
    });
  }

  const overBudget = categories.filter((c) => c.budget > 0 && c.spent > c.budget);
  if (overBudget.length) {
    items.push({
      id: "over-budget",
      tone: "danger",
      title: `${overBudget.length} categoria(s) acima do orçamento`,
      detail: overBudget
        .slice(0, 3)
        .map((c) => `${c.name} (${formatBRL(c.spent - c.budget)} acima)`)
        .join(" · "),
    });
  }

  const late = bills.filter((b) => b.status === "overdue" || new Date(b.dueDate) < new Date());
  if (late.length) {
    items.push({
      id: "late",
      tone: "danger",
      title: `${late.length} conta(s) vencida(s)`,
      detail: `Total de ${formatBRL(late.reduce((acc, b) => acc + b.amount, 0))} em atraso.`,
    });
  }

  if (summary.future_installments_cents > 0) {
    items.push({
      id: "future",
      tone: "warning",
      title: `${formatBRL(summary.future_installments_cents)} em parcelas futuras`,
      detail: "Compromisso já assumido para os próximos meses.",
    });
  }

  if (summary.savings_rate_pct != null && summary.savings_rate_pct >= 20) {
    items.push({
      id: "savings",
      tone: "success",
      title: `Você poupou ${summary.savings_rate_pct.toFixed(0)}% da renda`,
      detail: `Sobrou ${formatBRL(summary.result_cents)} no mês.`,
    });
  }

  return items.slice(0, 4);
}

export function DashboardView({
  data,
  monthLabel,
  today,
}: {
  data: DashboardData;
  monthLabel: string;
  today: string;
}) {
  const { summary, categories, bills, months, health, hasData } = data;
  const insights = buildInsights(data);
  const categoriesTotal = categories.reduce((acc, c) => acc + c.spent, 0);

  const exportRows: Array<[string, string]> = [
    ["Período", monthLabel],
    ["Saldo disponível", formatBRL(summary.balance_cents)],
    ["Receitas", formatBRL(summary.income_cents)],
    ["Despesas", formatBRL(summary.expense_cents)],
    ["Resultado", formatBRL(summary.result_cents)],
    ["Contas a pagar", formatBRL(summary.bills_open_cents)],
    ["Faturas de cartão", formatBRL(summary.card_invoices_open_cents)],
    ["Investimentos", formatBRL(summary.investments_cents)],
    ["Patrimônio líquido", formatBRL(summary.net_worth_cents)],
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">Visão geral</h1>
            <Badge tone="primary">{monthLabel}</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Saldo real, resultado do mês e compromissos — sem misturar caixa com competência.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton rows={exportRows} filename={`financas-${monthLabel.toLowerCase().replace(/\s/g, "-")}`} />
          <Link href="/relatorios" className="inline-flex">
            <Button size="sm">
              Relatórios
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {!hasData && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-3 py-5 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-primary-soft text-primary">
              <PlusCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">Seu espaço está pronto — falta o primeiro lançamento</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Já criamos sua conta principal, as categorias e o espaço financeiro. Registre uma
                receita ou despesa para o dashboard começar a calcular.
              </p>
            </div>
            <Link href="/transacoes?novo=1" className="shrink-0">
              <Button size="sm">Novo lançamento</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo disponível" value={summary.balance_cents} change={null} hint="contas ativas" icon={Wallet} tone="primary" />
        <KpiCard label="Receitas do mês" value={summary.income_cents} change={summary.income_change_pct} hint="recebidas" icon={TrendingUp} tone="success" />
        <KpiCard label="Despesas do mês" value={summary.expense_cents} change={summary.expense_change_pct} hint="pagas no mês" icon={TrendingDown} tone="danger" invertChange />
        <KpiCard label="Resultado mensal" value={summary.result_cents} change={null} hint="receitas − despesas" icon={Coins} tone="violet" />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Contas a pagar" value={summary.bills_open_cents} change={null} hint={`${bills.length} em aberto`} icon={Receipt} tone="warning" />
        <KpiCard label="Faturas de cartão" value={summary.card_invoices_open_cents} change={null} hint="em aberto" icon={CreditCard} tone="danger" />
        <KpiCard label="Investimentos" value={summary.investments_cents} change={null} hint="valor atual" icon={LineChart} tone="violet" />
        <KpiCard label="Patrimônio líquido" value={summary.net_worth_cents} change={null} hint="ativos − passivos" icon={Landmark} tone="primary" />
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-wrap gap-2">
            <div>
              <CardTitle>Evolução financeira</CardTitle>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Receitas
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Despesas
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Resultado
                </span>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              últimos {months.length || 0} meses
            </span>
          </CardHeader>
          <CardContent className="pt-1">
            {months.length ? (
              <EvolutionChart data={months} />
            ) : (
              <div className="grid h-[280px] place-items-center rounded-[10px] border border-dashed border-border">
                <p className="max-w-[260px] text-center text-[12px] text-muted-foreground">
                  O gráfico começa a ser desenhado quando houver movimento em pelo menos um mês.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de despesas</CardTitle>
            <span className="text-[11px] text-muted-foreground">{formatBRL(summary.expense_cents)}</span>
          </CardHeader>
          <CardContent className="pt-1">
            <CategoryDonut slices={categories} total={categoriesTotal} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Próximos vencimentos</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {bills.length} compromisso(s) · ordenados pelo vencimento
              </p>
            </div>
            <Link href="/contas-a-pagar" className="text-[11.5px] font-medium text-primary hover:underline">
              ver todas
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            {bills.length ? (
              <UpcomingBills bills={bills} today={today} />
            ) : (
              <div className="grid place-items-center rounded-[10px] border border-dashed border-border py-8">
                <p className="text-[12px] text-muted-foreground">Nenhuma conta em aberto. 👌</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saúde financeira</CardTitle>
            <Link href="/relatorios" className="text-[11.5px] font-medium text-primary hover:underline">
              detalhar
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            <HealthScoreCard health={health} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Análises do assistente</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <InsightsList items={insights} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Indicadores do mês</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <IndicatorsCard summary={summary} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
