import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuickForm } from "@/components/commitments/quick-form";
import { createPurchase } from "@/server/actions/commitments";
import { getCards, getPurchases } from "@/server/queries/commitments";
import { getFormOptions, todayInSaoPaulo } from "@/server/queries/transactions";
import { formatBRL } from "@/lib/money";

export const instant = false;

function br(iso: string) {
  return iso.split("-").reverse().join("/");
}

export default async function ComprasParceladasPage() {
  const [{ cards }, purchases, options] = await Promise.all([getCards(), getPurchases(), getFormOptions()]);
  const today = todayInSaoPaulo();
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Compras parceladas</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Cada compra gera N parcelas com rateio exato de centavos, uma por fatura.
          </p>
        </div>
        <Badge tone="primary">{purchases.length} compra(s)</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Compras</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {purchases.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                Nenhuma compra parcelada ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {purchases.map((purchase) => {
                  const pct = purchase.installments > 0 ? (purchase.paidInstallments / purchase.installments) * 100 : 0;
                  return (
                    <li key={purchase.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-medium">{purchase.description}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {purchase.cardName} · {purchase.paidInstallments}/{purchase.installments} pagas ·{" "}
                            {br(purchase.firstDue)} → {br(purchase.lastDue)}
                          </p>
                        </div>
                        <span className="text-[13px] font-medium tabular-nums">{formatBRL(purchase.totalCents)}</span>
                      </div>
                      <Progress value={pct} className="mt-2 h-1" tone={pct >= 100 ? "success" : "primary"} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nova compra parcelada</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <QuickForm
              action={createPurchase}
              submitLabel="Gerar parcelas"
              fields={[
                {
                  name: "cardId",
                  label: "Cartão",
                  type: "select",
                  required: true,
                  options: cards.map((c) => ({ value: c.id, label: c.name })),
                  full: true,
                },
                { name: "description", label: "Descrição", required: true, placeholder: "Notebook", full: true },
                { name: "total", label: "Valor total (R$)", type: "money", required: true, placeholder: "3.600,00" },
                { name: "installments", label: "Parcelas", type: "number", required: true, defaultValue: "12" },
                { name: "purchaseDate", label: "Data da compra", type: "date", required: true, defaultValue: today },
                {
                  name: "firstDue",
                  label: "1º vencimento",
                  type: "date",
                  required: true,
                  defaultValue: nextMonth.toISOString().slice(0, 10),
                },
                {
                  name: "categoryId",
                  label: "Categoria",
                  type: "select",
                  options: options.categories
                    .filter((c) => c.kind !== "income")
                    .map((c) => ({ value: c.id, label: c.name })),
                  full: true,
                },
              ]}
            />
            {cards.length === 0 && (
              <p className="mt-3 rounded-[9px] bg-warning-soft px-2.5 py-1.5 text-[11.5px] text-warning">
                Cadastre um cartão primeiro em /cartoes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
