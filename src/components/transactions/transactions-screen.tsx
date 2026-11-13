import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionFilters } from "@/components/transactions/filters";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { formatBRL } from "@/lib/money";
import { getFormOptions, listTransactions, monthRange, todayInSaoPaulo } from "@/server/queries/transactions";

export type ScreenFilters = {
  from?: string;
  to?: string;
  kind?: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
  page?: string;
};

function clampPage(value: string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function buildHref(base: string, filters: ScreenFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "page") params.set(key, String(value));
  }
  params.set("page", String(page));
  return `${base}?${params.toString()}`;
}

export async function TransactionsScreen({
  basePath,
  title,
  subtitle,
  fixedKind,
  filters,
}: {
  basePath: string;
  title: string;
  subtitle: string;
  fixedKind?: "income" | "expense";
  filters: ScreenFilters;
}) {
  const today = todayInSaoPaulo();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const { start, end } = monthRange(todayYear ?? 2026, todayMonth ?? 1);

  const from = filters.from ?? start;
  const to = filters.to ?? end;
  const page = clampPage(filters.page);

  const [{ rows, total, pages, incomeCents, expenseCents }, options] = await Promise.all([
    listTransactions({
      from,
      to,
      kind: fixedKind ?? (filters.kind === "income" || filters.kind === "expense" ? filters.kind : undefined),
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      q: filters.q,
      page,
    }),
    getFormOptions(),
  ]);

  const result = incomeCents - expenseCents;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
            <Badge tone="primary">{total} lançamento(s)</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>
        </div>
        <Link href={`/transacoes/nova?tipo=${fixedKind ?? "expense"}`} className="inline-flex">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Entradas</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-success">{formatBRL(incomeCents)}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Saídas</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-danger">{formatBRL(expenseCents)}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Resultado do filtro</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums">{formatBRL(result)}</p>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-col items-start gap-2">
          <CardTitle>Filtros</CardTitle>
          <div className="w-full">
            <TransactionFilters
              action={basePath}
              from={from}
              to={to}
              kind={filters.kind}
              accountId={filters.accountId}
              categoryId={filters.categoryId}
              q={filters.q}
              accounts={options.accounts}
              categories={options.categories}
              hideKind={Boolean(fixedKind)}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <TransactionsTable rows={rows} />

          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={buildHref(basePath, filters, page - 1)}>
                    <Button variant="outline" size="sm">
                      Anterior
                    </Button>
                  </Link>
                )}
                {page < pages && (
                  <Link href={buildHref(basePath, filters, page + 1)}>
                    <Button variant="outline" size="sm">
                      Próxima
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
