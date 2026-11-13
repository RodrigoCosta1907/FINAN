"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/actions/commitments";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export type QuickField = {
  name: string;
  label: string;
  type?: "text" | "date" | "money" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  full?: boolean;
};

const base =
  "h-9 w-full rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";

export function QuickForm({
  action,
  fields,
  submitLabel,
  columns = 2,
}: {
  action: Action;
  fields: QuickField[];
  submitLabel: string;
  columns?: 1 | 2;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className={cn("grid gap-2", columns === 2 ? "sm:grid-cols-2" : "")}>
      {fields.map((field) => (
        <label key={field.name} className={cn("flex flex-col gap-1", field.full && "sm:col-span-2")}>
          <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{field.label}</span>
          {field.type === "select" ? (
            <select name={field.name} defaultValue={field.defaultValue ?? ""} required={field.required} className={base}>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              inputMode={field.type === "money" ? "decimal" : undefined}
              defaultValue={field.defaultValue}
              placeholder={field.placeholder}
              required={field.required}
              min={field.type === "number" ? 1 : undefined}
              className={base}
            />
          )}
        </label>
      ))}

      {state.error && (
        <p className="flex items-start gap-1.5 rounded-[9px] bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger sm:col-span-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 rounded-[9px] bg-success-soft px-2.5 py-1.5 text-[11.5px] text-success sm:col-span-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Registrado.
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
