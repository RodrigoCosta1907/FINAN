"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/server/actions/accounts";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const input =
  "h-9 w-full rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";

export function AccountForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-2">
      <input name="name" required maxLength={60} placeholder="Nome da conta" className={input} />
      <select name="type" className={input} defaultValue="checking">
        <option value="checking">Conta corrente</option>
        <option value="savings">Poupança</option>
        <option value="digital">Conta digital</option>
        <option value="cash">Carteira</option>
        <option value="joint">Conta conjunta</option>
        <option value="investment">Investimentos</option>
      </select>
      <input name="institution" maxLength={60} placeholder="Instituição (opcional)" className={input} />
      <input name="opening" inputMode="decimal" placeholder="Saldo inicial (ex.: 1.250,00)" className={input} />

      {state.error && (
        <p className="flex items-start gap-1.5 rounded-[9px] bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger sm:col-span-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 rounded-[9px] bg-success-soft px-2.5 py-1.5 text-[11.5px] text-success sm:col-span-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Conta criada.
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Adicionar conta
        </Button>
      </div>
    </form>
  );
}
