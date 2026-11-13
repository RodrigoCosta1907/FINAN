import { TransactionsScreen, type ScreenFilters } from "@/components/transactions/transactions-screen";

export const instant = false;

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<ScreenFilters>;
}) {
  const filters = await searchParams;

  return (
    <TransactionsScreen
      basePath="/receitas"
      title="Receitas"
      subtitle="Entradas por competência: salário, freelance, reembolsos e outras."
      fixedKind="income"
      filters={filters}
    />
  );
}
