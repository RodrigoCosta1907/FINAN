import { ArrowDownLeft, ArrowUpRight, Ban, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cancelTransaction, duplicateTransaction } from "@/server/actions/transactions";
import type { TxRow } from "@/server/queries/transactions";

function dayMonth(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export function TransactionsTable({ rows }: { rows: TxRow[] }) {
  if (!rows.length) {
    return (
      <div className="grid place-items-center rounded-[10px] border border-dashed border-border py-12">
        <p className="text-[12.5px] text-muted-foreground">
          Nenhum lançamento no período. Use “Novo lançamento” ou mande pelo Telegram.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="py-2 pr-2 font-medium">Data</th>
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 font-medium">Categoria</th>
            <th className="py-2 pr-2 font-medium">Conta</th>
            <th className="py-2 pr-2 text-right font-medium">Valor</th>
            <th className="py-2 pl-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const income = row.kind === "income";
            const canceled = row.status === "canceled";
            return (
              <tr key={row.id} className={cn("border-b border-border/60 last:border-0", canceled && "opacity-50")}>
                <td className="py-2.5 pr-2 whitespace-nowrap tabular-nums text-muted-foreground">
                  {dayMonth(row.date)}
                </td>
                <td className="py-2.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    {income ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-danger" />
                    )}
                    <span className={cn("truncate", canceled && "line-through")}>{row.description}</span>
                    {row.isShared && <Badge tone="violet">dividida</Badge>}
                    {canceled && <Badge tone="neutral">cancelado</Badge>}
                    {row.status === "reconciled" && <Badge tone="primary">conciliado</Badge>}
                  </div>
                  {row.personName && (
                    <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">pago por {row.personName}</p>
                  )}
                </td>
                <td className="py-2.5 pr-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: row.categoryColor }} />
                    {row.categoryName}
                  </span>
                </td>
                <td className="py-2.5 pr-2 text-muted-foreground">{row.accountName}</td>
                <td className={cn("py-2.5 pr-2 text-right font-medium tabular-nums", income ? "text-success" : "text-foreground")}>
                  {income ? "+" : "−"} {formatBRL(row.amountCents)}
                </td>
                <td className="py-2.5 pl-2">
                  <div className="flex items-center justify-end gap-1">
                    <form action={duplicateTransaction}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button variant="ghost" size="icon" type="submit" title="Duplicar" aria-label="Duplicar">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                    {!canceled && (
                      <form action={cancelTransaction}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button variant="ghost" size="icon" type="submit" title="Cancelar" aria-label="Cancelar">
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        Cancelar preserva o histórico — o lançamento fica marcado, não é apagado.
      </p>
    </div>
  );
}
