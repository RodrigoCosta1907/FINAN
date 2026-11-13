import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickForm } from "@/components/commitments/quick-form";
import { createBill, payBill } from "@/server/actions/commitments";
import { getBills } from "@/server/queries/commitments";
import { getFormOptions, todayInSaoPaulo } from "@/server/queries/transactions";
import { formatBRL } from "@/lib/money";
import { differenceInCalendarDays, parseISO } from "date-fns";

export const instant = false;

export default async function ContasAPagarPage() {
  const [bills, options] = await Promise.all([getBills(), getFormOptions()]);
  const today = todayInSaoPaulo();
  const totalOpen = bills.reduce((acc, bill) => acc + (bill.amountCents - bill.paidCents), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Contas a pagar</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Compromissos do mês. Pagar aqui gera a despesa real na conta escolhida.
          </p>
        </div>
        <Badge tone="warning">Em aberto {formatBRL(totalOpen)}</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Em aberto</CardTitle>
            <span className="text-[11px] text-muted-foreground">{bills.length} conta(s)</span>
          </CardHeader>
          <CardContent className="pt-1">
            {bills.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-muted-foreground">Nenhuma conta em aberto. 👌</p>
            ) : (
              <ul className="divide-y divide-border">
                {bills.map((bill) => {
                  const open = bill.amountCents - bill.paidCents;
                  const diff = differenceInCalendarDays(parseISO(bill.dueDate), parseISO(today));
                  const late = diff < 0;
                  return (
                    <li key={bill.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-medium">{bill.description}</p>
                            {late && <Badge tone="danger">vencida {Math.abs(diff)}d</Badge>}
                            {bill.status === "partially_paid" && <Badge tone="warning">parcial</Badge>}
                          </div>
                          <p className="text-[11.5px] text-muted-foreground">
                            {bill.categoryName ?? "Sem categoria"} · vence {bill.dueDate.split("-").reverse().join("/")}
                          </p>
                        </div>
                        <span className="text-[13px] font-medium tabular-nums">{formatBRL(open)}</span>
                      </div>

                      <form action={payBill} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="billId" value={bill.id} />
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
                          Pagar
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
            <CardTitle>Nova conta a pagar</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <QuickForm
              action={createBill}
              submitLabel="Adicionar conta"
              fields={[
                { name: "description", label: "Descrição", required: true, placeholder: "Aluguel", full: true },
                { name: "amount", label: "Valor (R$)", type: "money", required: true, placeholder: "1.800,00" },
                { name: "dueDate", label: "Vencimento", type: "date", required: true, defaultValue: today },
                {
                  name: "categoryId",
                  label: "Categoria",
                  type: "select",
                  options: options.categories
                    .filter((c) => c.kind !== "income")
                    .map((c) => ({ value: c.id, label: c.name })),
                },
                {
                  name: "accountId",
                  label: "Conta prevista",
                  type: "select",
                  options: options.accounts.map((a) => ({ value: a.id, label: a.name })),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
