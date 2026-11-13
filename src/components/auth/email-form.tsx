"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthState } from "@/app/(auth)/actions";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

const inputClass =
  "h-10 w-full rounded-[10px] border border-border bg-card px-3 text-[13.5px] text-foreground " +
  "outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";

export function EmailForm({
  action,
  title,
  description,
  submitLabel,
  passwordField,
  successHref,
}: {
  action: Action;
  title: string;
  description: string;
  submitLabel: string;
  passwordField?: boolean;
  successHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 mb-5 text-[12.5px] text-muted-foreground">{description}</p>

      <form action={formAction} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@email.com"
            className={inputClass}
          />
        </label>

        {passwordField && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Nova senha
            </span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="mínimo 8 caracteres"
              className={inputClass}
            />
          </label>
        )}

        {state.error && (
          <p className="flex items-start gap-1.5 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {state.error}
          </p>
        )}

        {state.message && (
          <p className="flex items-start gap-1.5 rounded-[10px] bg-success-soft px-3 py-2 text-[12px] text-success">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </form>

      <p className="mt-4 text-center text-[12px]">
        {successHref ? (
          <Link href={successHref} className="font-medium text-primary underline-offset-2 hover:underline">
            Voltar para o login
          </Link>
        ) : (
          <Link href="/entrar" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Voltar para o login
          </Link>
        )}
      </p>
    </div>
  );
}
