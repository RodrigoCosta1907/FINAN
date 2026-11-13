import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickForm } from "@/components/commitments/quick-form";
import { createRecurring, materializeRecurring } from "@/server/actions/commitments";
import { getRecurring } from "@/server/queries/commitments";
import { getFormOptions, todayInSaoPaulo } from "@/server/queries/transactions";
import { formatBRL } from "@/lib/money";

export const instant = false;

const freqLabel: Record<string, string> = {
  daily: "diária",
  weekly: "semanal",
  biweekly: "quinzenal",
  monthly: "mensal",
  bimonthly: "bimestral",
  quarterly: "trimestral",
  semiannual: "semestral",
  yearly: "anual",
};

export default async function RecorrenciasPage() {
  const [rules, options] = await Promise.all([getRecurring(), getFormOptions()]);
  const today = todayInSaoPaulo();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Recorrências</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Aluguel, internet, assinaturas. Gerar compromissos não duplica ocorrência já existente.
          </p>
        </div>
        <form action={materializeRecurring}>
          <Button type="submit" size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar próximos 60 dias
          </Button>
        </form>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Suas recorrências</CardTitle>
            <span className="text-[11px] text-muted-foreground">{rules.length}</span>
          </CardHeader>
          <CardContent className="pt-1">
            {rules.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                Nenhuma recorrência cadastrada.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-medium">{rule.description}</p>
                        <Badge tone={rule.kind === "income" ? "success" : "neutral"}>
                          {rule.kind === "income" ? "receita" : "despesa"}
                        </Badge>
                        {!rule.isActive && <Badge tone="neutral">inativa</Badge>}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">
                        {freqLabel[rule.frequency] ?? rule.frequency} · desde {rule.startDate.split("-").reverse().join("/")} ·{" "}
                        {rule.occurrences} ocorrência(s) gerada(s)
                      </p>
                    </div>
                    <span className="text-[13px] font-medium tabular-nums">{formatBRL(rule.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nova recorrência</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <QuickForm
              action={createRecurring}
              submitLabel="Adicionar"
              fields={[
                { name: "description", label: "Descrição", required: true, placeholder: "Internet", full: true },
                {
                  name: "kind",
                  label: "Tipo",
                  type: "select",
                  required: true,
                  options: [
                    { value: "expense", label: "Despesa" },
                    { value: "income", label: "Receita" },
                  ],
                },
                { name: "amount", label: "Valor (R$)", type: "money", required: true, placeholder: "120,00" },
                {
                  name: "frequency",
                  label: "Frequência",
                  type: "select",
                  required: true,
                  defaultValue: "monthly",
                  options: Object.entries(freqLabel).map(([value, label]) => ({ value, label })),
                },
                { name: "startDate", label: "Início", type: "date", required: true, defaultValue: today },
                {
                  name: "categoryId",
                  label: "Categoria",
                  type: "select",
                  options: options.categories.map((c) => ({ value: c.id, label: c.name })),
                },
                {
                  name: "accountId",
                  label: "Conta",
                  type: "select",
                  options: options.accounts.map((a) => ({ value: a.id, label: a.name })),
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
