import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Criar conta" };
export const instant = false;

export default function CriarContaPage() {
  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-tight">Criar conta</h2>
      <p className="mt-1 mb-5 text-[12.5px] text-muted-foreground">
        Em 30 segundos você tem um espaço financeiro com categorias e conta principal já criados.
      </p>
      <AuthForm action={signUp} mode="signup" />
    </div>
  );
}
