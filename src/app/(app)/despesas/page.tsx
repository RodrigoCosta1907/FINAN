import { TransactionsScreen, type ScreenFilters } from "@/components/transactions/transactions-screen";

export const instant = false;

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<ScreenFilters>;
}) {
  const filters = await searchParams;

  return (
    <TransactionsScreen
      basePath="/despesas"
      title="Despesas"
      subtitle="Saídas por competência, com categoria e conta de origem."
      fixedKind="expense"
      filters={filters}
    />
  );
}
