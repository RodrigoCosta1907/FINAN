import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickForm } from "@/components/commitments/quick-form";
import { Progress } from "@/components/ui/progress";
import { closeInvoice, createCard, payInvoice } from "@/server/actions/commitments";
import { getCards } from "@/server/queries/commitments";
import { formatBRL } from "@/lib/money";
import { todayInSaoPaulo } from "@/server/queries/transactions";

export const instant = false;

const statusTone: Record<string, "neutral" | "primary" | "warning" | "danger" | "success"> = {
  open: "primary",
  closed: "warning",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
};

export default async function CartoesPage() {
  const { cards, invoices, accounts } = await getCards();
  const today = todayInSaoPaulo();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Cartões de crédito</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Limite, fatura e pagamento. Pagar a fatura baixa o passivo — não cria uma despesa nova.
          </p>
        </div>
        <Badge tone="primary">{cards.length} cartão(ões)</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {cards.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-[12.5px] text-muted-foreground">
                Nenhum cartão cadastrado. Crie o primeiro ao lado para lançar compras parceladas.
              </CardContent>
            </Card>
          )}

          {cards.map((card) => {
            const usedPct = card.limitCents > 0 ? (card.usedCents / card.limitCents) * 100 : 0;
            return (
              <Card key={card.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-violet-soft text-violet">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium">{card.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {card.institution ?? "—"} · fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11.5px] text-muted-foreground">
                    disponível <strong className="text-foreground">{formatBRL(card.availableCents)}</strong>
                  </span>
                </CardHeader>
                <CardContent className="space-y-2 pt-1">
                  <Progress value={usedPct} tone={usedPct > 80 ? "danger" : usedPct > 60 ? "warning" : "primary"} />
                  <div className="flex justify-between text-[11.5px] text-muted-foreground">
                    <span>usado {formatBRL(card.usedCents)}</span>
                    <span>limite {formatBRL(card.limitCents)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle>Faturas em aberto</CardTitle>
              <span className="text-[11px] text-muted-foreground">{invoices.length}</span>
            </CardHeader>
            <CardContent className="pt-1">
              {invoices.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-muted-foreground">Nenhuma fatura em aberto.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoices.map((invoice) => {
                    const open = invoice.totalCents - invoice.paidCents;
                    return (
                      <li key={invoice.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-medium">
                              {invoice.cardName} · {invoice.period}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground">
                              vence {invoice.dueDate.split("-").reverse().join("/")} · aberto {formatBRL(open)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={statusTone[invoice.status] ?? "neutral"}>{invoice.status}</Badge>
                            <span className="text-[13px] font-medium tabular-nums">{formatBRL(invoice.totalCents)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <form action={payInvoice} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <input type="hidden" name="amount" value={(open / 100).toFixed(2)} />
                            <select name="accountId" defaultValue={accounts[0]?.id ?? ""} className="h-8 rounded-[8px] border border-border bg-card px-2 text-[12px]">
                              {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" size="sm" variant="outline" disabled={open <= 0 || accounts.length === 0}>
                              Pagar {formatBRL(open)}
                            </Button>
                          </form>

                          {invoice.status === "open" && (
                            <form action={closeInvoice}>
                              <input type="hidden" name="invoiceId" value={invoice.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                Fechar fatura
                              </Button>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Novo cartão</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <QuickForm
              action={createCard}
              submitLabel="Adicionar cartão"
              fields={[
                { name: "name", label: "Nome", required: true, placeholder: "Nubank" },
                { name: "institution", label: "Instituição", placeholder: "Nubank" },
                { name: "limit", label: "Limite (R$)", type: "money", required: true, placeholder: "5.000,00" },
                { name: "closingDay", label: "Dia de fechamento", type: "number", required: true, defaultValue: "20" },
                { name: "dueDay", label: "Dia de vencimento", type: "number", required: true, defaultValue: "28" },
                {
                  name: "accountId",
                  label: "Conta de pagamento",
                  type: "select",
                  options: accounts.map((a) => ({ value: a.id, label: a.name })),
                },
              ]}
            />
            <p className="mt-3 text-[10.5px] text-muted-foreground">
              Hoje: {today.split("-").reverse().join("/")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
