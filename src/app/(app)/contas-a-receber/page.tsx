import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickForm } from "@/components/commitments/quick-form";
import { createReceivable, receiveReceivable } from "@/server/actions/commitments";
import { getReceivables } from "@/server/queries/commitments";
import { getFormOptions, todayInSaoPaulo } from "@/server/queries/transactions";
import { formatBRL } from "@/lib/money";

export const instant = false;

export default async function ContasAReceberPage() {
  const [receivables, options] = await Promise.all([getReceivables(), getFormOptions()]);
  const today = todayInSaoPaulo();
  const totalOpen = receivables.reduce((acc, r) => acc + (r.amountCents - r.receivedCents), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Contas a receber</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Empréstimos, reembolsos e receitas pendentes. Receber aqui gera a entrada na conta.
          </p>
        </div>
        <Badge tone="success">A receber {formatBRL(totalOpen)}</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
            <span className="text-[11px] text-muted-foreground">{receivables.length} título(s)</span>
          </CardHeader>
          <CardContent className="pt-1">
            {receivables.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                Nada a receber registrado.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {receivables.map((item) => {
                  const open = item.amountCents - item.receivedCents;
                  return (
                    <li key={item.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-medium">{item.description}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {item.personName ?? "sem devedor"} · previsto {item.expectedDate.split("-").reverse().join("/")}
                          </p>
                        </div>
                        <span className="text-[13px] font-medium tabular-nums">{formatBRL(open)}</span>
                      </div>

                      <form action={receiveReceivable} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="receivableId" value={item.id} />
                        <input
                          name="amount"
                          defaultValue={(open / 100).toFixed(2)}
                          inputMode="decimal"
                          className="h-8 w-24 rounded-[8px] border border-border bg-card px-2 text-[12px] tabular-nums"
                        />
                        <select
                          name="accountId"
                          defaultValue={options.accounts[0]?.id ?? ""}
                          className="h-8 rounded-[8px] border border-border bg-card px-2 text-[12px]"
                        >
                          {options.accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="outline">
                          Receber
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Novo a receber</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <QuickForm
              action={createReceivable}
              submitLabel="Adicionar"
              fields={[
                { name: "description", label: "Descrição", required: true, placeholder: "Empréstimo para João", full: true },
                { name: "amount", label: "Valor (R$)", type: "money", required: true, placeholder: "500,00" },
                { name: "expectedDate", label: "Previsão", type: "date", required: true, defaultValue: today },
                {
                  name: "personId",
                  label: "Devedor",
                  type: "select",
                  options: options.people.map((p) => ({ value: p.id, label: p.name })),
                  full: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
