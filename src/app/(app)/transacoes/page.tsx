import { TransactionsScreen, type ScreenFilters } from "@/components/transactions/transactions-screen";

export const instant = false;

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<ScreenFilters & { ok?: string }>;
}) {
  const filters = await searchParams;

  return (
    <TransactionsScreen
      basePath="/transacoes"
      title="Transações"
      subtitle="Tudo que entrou e saiu, por competência. Cancelar preserva o histórico."
      filters={filters}
    />
  );
}
