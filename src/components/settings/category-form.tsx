"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/server/actions/accounts";
import type { Option } from "@/server/queries/transactions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const input =
  "h-9 w-full rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";

export function CategoryForm({ action, parents }: { action: Action; parents: Option[] }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="grid gap-2">
      <input name="name" required maxLength={40} placeholder="Nome da categoria" className={input} />
      <div className="grid grid-cols-2 gap-2">
        <select name="kind" defaultValue="expense" className={input}>
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
          <option value="both">Ambas</option>
        </select>
        <input name="color" type="color" defaultValue="#2563EB" className="h-9 w-full rounded-[9px] border border-border bg-card p-1" />
      </div>
      <select name="parentId" defaultValue="" className={input}>
        <option value="">Categoria principal</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>
            Subcategoria de {parent.name}
          </option>
        ))}
      </select>

      {state.error && (
        <p className="flex items-start gap-1.5 rounded-[9px] bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 rounded-[9px] bg-success-soft px-2.5 py-1.5 text-[11.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Categoria criada.
        </p>
      )}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Adicionar categoria
      </Button>
    </form>
  );
}
