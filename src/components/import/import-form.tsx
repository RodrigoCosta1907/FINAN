"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmImport, previewInvoice, type PreviewState } from "@/server/actions/import";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export function ImportForm() {
  const [state, formAction, pending] = useActionState<PreviewState, FormData>(previewInvoice, {});
  const prepared = state.prepared;

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 rounded-[14px] border border-border bg-card p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">PDF da fatura</span>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="h-9 w-full cursor-pointer rounded-[9px] border border-border bg-card px-2.5 py-1.5 text-[12px] file:mr-3 file:rounded-[6px] file:border-0 file:bg-primary-soft file:px-2 file:py-1 file:text-[11.5px] file:text-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Senha do PDF (se houver)
          </span>
          <input
            type="password"
            name="password"
            autoComplete="off"
            placeholder="só usada para abrir o arquivo"
            className="h-9 w-full rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] outline-none focus-visible:border-ring"
          />
        </label>

        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            Ler fatura
          </Button>
        </div>

        {state.error && (
          <p className="flex items-start gap-1.5 rounded-[9px] bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger sm:col-span-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {state.error}
          </p>
        )}
      </form>

      {prepared && (
        <div className="space-y-3 rounded-[14px] border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium">
                {state.fileName} · {prepared.issuer === "nubank" ? "Nubank" : "Itaú/VISA"}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                vencimento {prepared.dueDate.split("-").reverse().join("/")} · {prepared.rows.length} lançamento(s)
              </p>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold tabular-nums">{brl(prepared.totalCents)}</p>
              <p className="text-[11px] text-muted-foreground">
                fatura: {prepared.invoiceTotalCents !== null ? brl(prepared.invoiceTotalCents) : "—"}
                {prepared.differenceCents !== null && prepared.differenceCents !== 0 && (
                  <span className="text-danger"> · dif {brl(prepared.differenceCents)}</span>
                )}
              </p>
            </div>
          </div>

          {prepared.warnings.length > 0 && (
            <ul className="space-y-1 rounded-[9px] bg-warning-soft px-2.5 py-2 text-[11.5px] text-warning">
              {prepared.warnings.map((warning) => (
                <li key={warning}>· {warning}</li>
              ))}
            </ul>
          )}

          <div className="max-h-[340px] overflow-auto rounded-[10px] border border-border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-subtle text-[10.5px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Data</th>
                  <th className="px-2 py-1.5 text-left font-medium">Final</th>
                  <th className="px-2 py-1.5 text-left font-medium">Descrição</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {prepared.rows.map((row) => (
                  <tr key={row.fingerprint} className="border-t border-border">
                    <td className="px-2 py-1.5 tabular-nums">{row.date.split("-").reverse().join("/")}</td>
                    <td className="px-2 py-1.5">
                      <Badge tone="neutral">{row.card_end ?? "—"}</Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      {row.description}
                      {row.installment_number && (
                        <span className="ml-1 text-[10.5px] text-muted-foreground">
                          [{row.installment_number}/{row.installment_total}]
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(row.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={confirmImport} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="payload" value={JSON.stringify(prepared)} />
            <Button type="submit" size="sm">
              <Upload className="h-3.5 w-3.5" />
              Importar {prepared.rows.length} lançamento(s)
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Nada é gravado antes deste clique. Reimportar a mesma fatura não duplica.
            </span>
          </form>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Cada final de cartão vira um cartão separado; a linha entra como compra de 1 parcela na fatura do ciclo.
      </p>
    </div>
  );
}
