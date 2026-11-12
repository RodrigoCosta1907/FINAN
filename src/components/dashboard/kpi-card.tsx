import {
  ArrowDownRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/lib/money";

export type KpiTone = "primary" | "success" | "danger" | "warning" | "violet" | "neutral";

const toneStyles: Record<KpiTone, { soft: string; text: string }> = {
  primary: { soft: "bg-primary-soft", text: "text-primary" },
  success: { soft: "bg-success-soft", text: "text-success" },
  danger: { soft: "bg-danger-soft", text: "text-danger" },
  warning: { soft: "bg-warning-soft", text: "text-warning" },
  violet: { soft: "bg-violet-soft", text: "text-violet" },
  neutral: { soft: "bg-muted", text: "text-muted-foreground" },
};

export function KpiCard({
  label,
  value,
  change,
  hint,
  icon: Icon,
  tone = "primary",
  invertChange = false,
}: {
  label: string;
  value: number;
  change: number | null;
  hint: string;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Quando true, "subir" é ruim (ex.: despesas). */
  invertChange?: boolean;
}) {
  const styles = toneStyles[tone];
  const positive = change !== null && change >= 0;
  const good = change === null ? null : invertChange ? !positive : positive;

  return (
    <Card className="group px-4 py-3.5 transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <span className={cn("grid h-7 w-7 place-items-center rounded-[9px]", styles.soft)}>
          <Icon className={cn("h-3.5 w-3.5", styles.text)} />
        </span>
      </div>

      <p className="mt-2 text-[21px] leading-tight font-semibold tracking-tight tabular-nums">
        {formatBRL(value)}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {change === null ? (
          <span className="text-[11.5px] text-muted-foreground">{hint}</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {formatPercent(change)}
            </span>
            <span className="truncate text-[11.5px] text-muted-foreground">{hint}</span>
          </>
        )}
      </div>
    </Card>
  );
}
