import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Option } from "@/server/queries/transactions";

const field =
  "h-9 rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none focus-visible:border-ring";

export function TransactionFilters({
  action,
  from,
  to,
  kind,
  accountId,
  categoryId,
  q,
  accounts,
  categories,
  hideKind,
}: {
  action: string;
  from: string;
  to: string;
  kind?: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
  accounts: Option[];
  categories: Option[];
  hideKind?: boolean;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">De</span>
        <input type="date" name="from" defaultValue={from} className={field} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Até</span>
        <input type="date" name="to" defaultValue={to} className={field} />
      </label>

      {!hideKind && (
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Tipo</span>
          <select name="tipo" defaultValue={kind ?? ""} className={field}>
            <option value="">Todos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Conta</span>
        <select name="conta" defaultValue={accountId ?? ""} className={field}>
          <option value="">Todas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Categoria</span>
        <select name="categoria" defaultValue={categoryId ?? ""} className={field}>
          <option value="">Todas</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[180px] flex-1 flex-col gap-1">
        <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Buscar</span>
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="descrição…"
            className={`${field} w-full pl-7`}
          />
        </span>
      </label>

      <Button type="submit" size="sm" variant="secondary" className="h-9">
        Filtrar
      </Button>
    </form>
  );
}
