"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Option } from "@/server/queries/transactions";
import type { TxState } from "@/server/actions/transactions";

type Action = (state: TxState, formData: FormData) => Promise<TxState>;

const input =
  "h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";
const label = "mb-1 block text-[12px] font-medium text-muted-foreground";

export function TransactionForm({
  action,
  accounts,
  categories,
  people,
  today,
  defaultKind = "expense",
}: {
  action: Action;
  accounts: Option[];
  categories: Option[];
  people: Option[];
  today: string;
  defaultKind?: "income" | "expense";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [kind, setKind] = useState<"income" | "expense">(defaultKind);

  const visibleCategories = categories.filter(
    (c) => c.kind === kind || c.kind === "both" || !c.kind,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />

      <div className="flex rounded-[10px] border border-border bg-muted p-0.5 text-[13px]">
        {(
          [
            ["expense", "Despesa", ArrowUpRight],
            ["income", "Receita", ArrowDownLeft],
          ] as const
        ).map(([value, text, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 font-medium transition-colors",
              kind === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {text}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={label}>Descrição</span>
          <input name="description" required maxLength={120} placeholder="Ex.: Atacadão" className={input} />
        </label>

        <label>
          <span className={label}>Valor (R$)</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="0,00"
            className={cn(input, "tabular-nums")}
          />
        </label>

        <label>
          <span className={label}>Data</span>
          <input name="date" type="date" required defaultValue={today} className={input} />
        </label>

        <label>
          <span className={label}>Conta</span>
          <select name="accountId" required className={input} defaultValue={accounts[0]?.id ?? ""}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={label}>Categoria</span>
          <select name="categoryId" className={input} defaultValue="">
            <option value="">Sem categoria</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="sm:col-span-2">
          <span className={label}>Quem pagou (opcional)</span>
          <select name="personId" className={input} defaultValue={people[0]?.id ?? ""}>
            <option value="">Não informar</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label className="sm:col-span-2">
          <span className={label}>Observações</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={500}
            placeholder="Opcional"
            className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
          />
        </label>
      </div>

      {accounts.length === 0 && (
        <p className="rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] text-warning">
          Você precisa de uma conta financeira ativa para lançar. Crie uma em Contas.
        </p>
      )}

      {state.error && (
        <p className="flex items-start gap-1.5 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11.5px] text-muted-foreground">
          Será salvo como <Badge tone="neutral">{kind === "income" ? "receita" : "despesa"}</Badge>
        </span>
        <div className="flex gap-2">
          <Link href="/transacoes">
            <Button variant="ghost" size="md" type="button">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" size="md" disabled={pending || accounts.length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar lançamento
          </Button>
        </div>
      </div>
    </form>
  );
}
