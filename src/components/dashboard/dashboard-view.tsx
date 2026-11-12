"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Coins,
  CreditCard,
  Download,
  Info,
  Landmark,
  LineChart,
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
import { HealthScoreCard, IndicatorsCard, InsightsList } from "@/components/dashboard/panels";
import { EvolutionChart } from "@/components/charts/evolution-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { useMonth } from "@/components/layout/month-context";
import { categories, evolution, isDemo, kpisFor, upcomingBills } from "@/lib/demo-data";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

function toCsv(rows: Array<[string, string]>) {
  return ["indicador;valor", ...rows.map(([k, v]) => `${k};${v}`)].join("\r\n");
}

export function DashboardView() {
  const { monthIndex, label } = useMonth();
  const [view, setView] = useState<"monthly" | "cumulative">("monthly");

  const kpis = useMemo(() => kpisFor(monthIndex), [monthIndex]);
  const series = useMemo(() => {
    if (view === "monthly") return evolution;
    let income = 0;
    let expense = 0;
    let invested = 0;
    return evolution.map((point) => {
      income += point.income;
      expense += point.expense;
      invested += point.invested;
      return { ...point, income, expense, invested, result: income - expense };
    });
  }, [view]);

  const expenseTotal = kpis.expense.value;
  const categoryTotal = categories.reduce((acc, slice) => acc + slice.spent, 0);

  function exportCsv() {
    const rows: Array<[string, string]> = [
      ["Período", label],
      ["Saldo disponível", formatBRL(kpis.balance.value)],
      ["Receitas", formatBRL(kpis.income.value)],
      ["Despesas", formatBRL(kpis.expense.value)],
      ["Resultado", formatBRL(kpis.result.value)],
      ["Contas a pagar", formatBRL(kpis.bills.value)],
      ["Faturas de cartão", formatBRL(kpis.invoices.value)],
      ["Investimentos", formatBRL(kpis.investments.value)],
      ["Patrimônio líquido", formatBRL(kpis.netWorth.value)],
    ];
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `financas-kpis-${label.toLowerCase().replace(" ", "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {isDemo && (
        <div className="flex items-start gap-2 rounded-[12px] border border-border bg-subtle px-3.5 py-2.5 text-[12px]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Ambiente de demonstração.</span> Os números
            abaixo são fictícios e servem para validar layout e cálculos. O banco (36 tabelas, RLS e
            funções financeiras) já está validado; a conexão com o Supabase entra na próxima etapa.
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">Visão geral</h1>
            <Badge tone="primary">{label}</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Saldo real, resultado do mês e compromissos — sem misturar caixa com competência.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
          <Link href="/relatorios" className="inline-flex">
            <Button size="sm">
              Relatórios
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo disponível" value={kpis.balance.value} change={kpis.balance.change} hint={kpis.balance.hint} icon={Wallet} tone="primary" />
        <KpiCard label="Receitas do mês" value={kpis.income.value} change={kpis.income.change} hint={kpis.income.hint} icon={TrendingUp} tone="success" />
        <KpiCard label="Despesas do mês" value={kpis.expense.value} change={kpis.expense.change} hint={kpis.expense.hint} icon={TrendingDown} tone="danger" invertChange />
        <KpiCard label="Resultado mensal" value={kpis.result.value} change={kpis.result.change} hint={kpis.result.hint} icon={Coins} tone="violet" />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Contas a pagar" value={kpis.bills.value} change={kpis.bills.change} hint={kpis.bills.hint} icon={Receipt} tone="warning" />
        <KpiCard label="Faturas de cartão" value={kpis.invoices.value} change={kpis.invoices.change} hint={kpis.invoices.hint} icon={CreditCard} tone="danger" />
        <KpiCard label="Investimentos" value={kpis.investments.value} change={kpis.investments.change} hint={kpis.investments.hint} icon={LineChart} tone="violet" />
        <KpiCard label="Patrimônio líquido" value={kpis.netWorth.value} change={kpis.netWorth.change} hint={kpis.netWorth.hint} icon={Landmark} tone="primary" />
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
            <div className="flex rounded-[9px] border border-border bg-muted p-0.5 text-[11.5px]">
              {(
                [
                  ["monthly", "Mensal"],
                  ["cumulative", "Acumulado"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  onClick={() => setView(value)}
                  aria-pressed={view === value}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 font-medium transition-colors",
                    view === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <EvolutionChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de despesas</CardTitle>
            <span className="text-[11px] text-muted-foreground">
              {formatBRL(expenseTotal)}
            </span>
          </CardHeader>
          <CardContent className="pt-1">
            <CategoryDonut total={categoryTotal} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Próximos vencimentos</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {upcomingBills.length} compromissos · ordenados pelo vencimento
              </p>
            </div>
            <Link href="/contas-a-pagar" className="text-[11.5px] font-medium text-primary hover:underline">
              ver todas
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            <UpcomingBills bills={upcomingBills} />
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
            <HealthScoreCard />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Análises do assistente</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Geradas a partir dos mesmos números do dashboard.
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <InsightsList />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Indicadores do mês</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <IndicatorsCard />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
