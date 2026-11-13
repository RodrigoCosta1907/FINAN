"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/lib/money";
import { Progress } from "@/components/ui/progress";

export type DonutSlice = {
  id: string;
  name: string;
  color: string;
  spent: number;
  budget: number;
};

type TooltipItem = { name?: string; value?: number | string };

function DonutTooltip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[12px] shadow-pop">
      <p className="font-medium">{item.name}</p>
      <p className="text-muted-foreground tabular-nums">{formatBRL(Number(item.value ?? 0))}</p>
    </div>
  );
}

export function CategoryDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  if (!slices.length) {
    return (
      <div className="grid h-[220px] place-items-center rounded-[10px] border border-dashed border-border text-center">
        <p className="max-w-[220px] text-[12px] text-muted-foreground">
          Nenhuma despesa neste mês ainda. A distribuição aparece no primeiro lançamento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[176px] w-[176px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="spent"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((slice) => (
                <Cell key={slice.id} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Total</span>
          <span className="text-[15px] font-semibold tabular-nums">{formatBRL(total)}</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {slices.map((slice) => {
          const pct = total > 0 ? (slice.spent / total) * 100 : 0;
          const used = slice.budget > 0 ? (slice.spent / slice.budget) * 100 : 0;
          return (
            <li key={slice.id}>
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                  <span className="min-w-0 truncate">{slice.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {pct.toFixed(0)}% · {formatBRL(slice.spent)}
                </span>
              </div>
              {slice.budget > 0 && (
                <Progress
                  value={used}
                  tone={used > 100 ? "danger" : used > 90 ? "warning" : "primary"}
                  className="mt-0.5 h-1"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
