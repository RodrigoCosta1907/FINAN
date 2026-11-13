import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { createTransaction } from "@/server/actions/transactions";
import { getFormOptions, todayInSaoPaulo } from "@/server/queries/transactions";

export const instant = false;

export default async function NovaTransacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const options = await getFormOptions();
  const kind = tipo === "income" ? "income" : "expense";

  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <Link
        href="/transacoes"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Transações
      </Link>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Novo lançamento</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Valor em reais. A data é a de competência (quando o gasto pertence ao mês).
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <TransactionForm
            action={createTransaction}
            accounts={options.accounts}
            categories={options.categories}
            people={options.people}
            today={todayInSaoPaulo()}
            defaultKind={kind}
          />
        </CardContent>
      </Card>
    </div>
  );
}
