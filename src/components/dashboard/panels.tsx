import { CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { HealthData, Summary } from "@/server/queries/dashboard";

export type Insight = {
  id: string;
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  detail: string;
};

const toneMap = {
  success: { icon: CircleCheck, className: "text-success bg-success-soft", badge: "success" as const, label: "ok" },
  warning: { icon: TriangleAlert, className: "text-warning bg-warning-soft", badge: "warning" as const, label: "atenção" },
  danger: { icon: TriangleAlert, className: "text-danger bg-danger-soft", badge: "danger" as const, label: "alerta" },
  info: { icon: Info, className: "text-primary bg-primary-soft", badge: "primary" as const, label: "info" },
};

export function InsightsList({ items }: { items: Insight[] }) {
  if (!items.length) {
    return (
      <p className="py-6 text-center text-[12px] text-muted-foreground">
        Sem análises ainda — elas aparecem a partir do primeiro lançamento.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((insight) => {
        const tone = toneMap[insight.tone];
        const Icon: LucideIcon = tone.icon;
        return (
          <li key={insight.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px]", tone.className)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] leading-snug font-medium">{insight.title}</p>
                <Badge tone={tone.badge} className="shrink-0">
                  {tone.label}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{insight.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function HealthScoreCard({ health }: { health: HealthData | null }) {
  if (!health) {
    return (
      <p className="py-6 text-center text-[12px] text-muted-foreground">
        O indicador é calculado quando houver receita e despesa no mês.
      </p>
    );
  }

  const label = health.score >= 80 ? "Excelente" : health.score >= 60 ? "Boa" : health.score >= 40 ? "Atenção" : "Crítica";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          className="relative grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--primary) ${health.score}%, var(--muted) 0)` }}
        >
          <div className="grid h-[60px] w-[60px] place-items-center rounded-full bg-card">
            <span className="text-[19px] leading-none font-semibold tabular-nums">{health.score}</span>
            <span className="text-[9.5px] text-muted-foreground">de 100</span>
          </div>
        </div>
        <div>
          <p className="text-[13px] font-medium">{label}</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Calculado com comprometimento da renda, poupança, reserva, dívidas e atrasos.
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground/80">
            Indicador interno — não é avaliação de crédito.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {health.components.map((component) => (
          <li key={component.name}>
            <div className="flex items-baseline justify-between text-[11.5px]">
              <span className="truncate text-muted-foreground">{component.name}</span>
              <span className="shrink-0 tabular-nums">
                {component.points.toFixed(0)}/{component.weight}
              </span>
            </div>
            <Progress
              value={component.weight > 0 ? (component.points / component.weight) * 100 : 0}
              className="mt-1 h-1"
              tone={component.weight > 0 && component.points / component.weight > 0.7 ? "success" : "warning"}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IndicatorsCard({ summary }: { summary: Summary }) {
  const rows = [
    {
      label: "Taxa de poupança",
      value: summary.savings_rate_pct != null ? `${summary.savings_rate_pct.toFixed(1)}%` : "—",
      hint: "receita − despesa",
    },
    {
      label: "Renda comprometida",
      value: summary.income_commitment_pct != null ? `${summary.income_commitment_pct.toFixed(1)}%` : "—",
      hint: "despesas / receitas",
    },
    { label: "Despesas fixas", value: formatBRL(summary.fixed_expenses_cents), hint: "recorrências mensais" },
    { label: "Despesas variáveis", value: formatBRL(summary.variable_expenses_cents), hint: "sem recorrência" },
    { label: "Parcelas futuras", value: formatBRL(summary.future_installments_cents), hint: "próximos meses" },
    { label: "Faturas em aberto", value: formatBRL(summary.card_invoices_open_cents), hint: "cartões" },
  ];

  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
          <dd className="text-right">
            <span className="block text-[12.5px] font-medium tabular-nums">{row.value}</span>
            <span className="block text-[10.5px] text-muted-foreground/80">{row.hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
