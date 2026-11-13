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

export function AuthForm({
  action,
  mode,
  next,
}: {
  action: Action;
  mode: "signin" | "signup";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === "signup" && (
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Nome</span>
          <input
            name="fullName"
            autoComplete="name"
            required
            placeholder="Rodrigo Costa"
            className={inputClass}
          />
        </label>
      )}

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

      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Senha</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={mode === "signup" ? "mínimo 8 caracteres" : "sua senha"}
          className={inputClass}
        />
      </label>

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
        {mode === "signup" ? "Criar conta" : "Entrar"}
      </Button>

      <p className="pt-1 text-center text-[12.5px] text-muted-foreground">
        {mode === "signup" ? (
          <>
            Já tem conta?{" "}
            <Link href="/entrar" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </>
        ) : (
          <>
            Ainda não tem conta?{" "}
            <Link href="/criar-conta" className="font-medium text-primary hover:underline">
              Criar conta
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
