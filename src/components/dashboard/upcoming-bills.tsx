"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Check, Clock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { demoToday, type UpcomingBill } from "@/lib/demo-data";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

const monthShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function UpcomingBills({ bills }: { bills: UpcomingBill[] }) {
  const [settled, setSettled] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () =>
      bills
        .map((bill) => {
          const diff = differenceInCalendarDays(parseISO(bill.dueDate), parseISO(demoToday));
          return { ...bill, diff };
        })
        .sort((a, b) => a.diff - b.diff),
    [bills],
  );

  return (
    <div className="divide-y divide-border">
      {rows.map((bill) => {
        const isPaid = settled.has(bill.id);
        const late = !isPaid && bill.diff < 0;
        const soon = !isPaid && bill.diff >= 0 && bill.diff <= 3;
        const date = parseISO(bill.dueDate);

        return (
          <div key={bill.id} className="flex items-center gap-3 px-1 py-2.5 first:pt-0 last:pb-0">
            <div
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border text-center",
                late
                  ? "border-danger/25 bg-danger-soft text-danger"
                  : "border-border bg-subtle text-muted-foreground",
              )}
            >
              <span className="text-[13px] leading-none font-semibold tabular-nums">{date.getDate()}</span>
              <span className="text-[9.5px] leading-none uppercase">{monthShort[date.getMonth()]}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={cn("truncate text-[13px] font-medium", isPaid && "line-through opacity-60")}>
                  {bill.description}
                </p>
                {late && (
                  <Badge tone="danger" className="shrink-0">
                    <TriangleAlert className="h-2.5 w-2.5" /> vencida
                  </Badge>
                )}
                {soon && (
                  <Badge tone="warning" className="shrink-0">
                    <Clock className="h-2.5 w-2.5" /> {bill.diff === 0 ? "hoje" : `${bill.diff}d`}
                  </Badge>
                )}
                {bill.status === "closed" && !isPaid && (
                  <Badge tone="primary" className="shrink-0">
                    fatura fechada
                  </Badge>
                )}
              </div>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {bill.category}
                {isPaid ? " · pago" : late ? ` · ${Math.abs(bill.diff)} dia(s) em atraso` : ` · em ${bill.diff} dia(s)`}
              </p>
            </div>

            <span className="shrink-0 text-[13px] font-medium tabular-nums">
              {formatBRL(bill.amount)}
            </span>

            <Button
              size="sm"
              variant={isPaid ? "secondary" : "outline"}
              onClick={() =>
                setSettled((current) => {
                  const next = new Set(current);
                  if (next.has(bill.id)) next.delete(bill.id);
                  else next.add(bill.id);
                  return next;
                })
              }
              className="shrink-0"
              aria-pressed={isPaid}
            >
              <Check className={cn("h-3.5 w-3.5", isPaid && "text-success")} />
              <span className="hidden sm:inline">{isPaid ? "Pago" : "Pagar"}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
