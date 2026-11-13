import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Entrar" };
export const instant = false;

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;

  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-tight">Entrar</h2>
      <p className="mt-1 mb-5 text-[12.5px] text-muted-foreground">
        Acesse seu espaço financeiro com e-mail e senha.
      </p>

      {erro && (
        <p className="mb-3 rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] text-warning">
          Não foi possível concluir pelo link. Entre com e-mail e senha.
        </p>
      )}

      <AuthForm action={signIn} mode="signin" next={next} />

      <p className="mt-3 text-center text-[12px]">
        <Link
          href="/recuperar-senha"
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Esqueci minha senha
        </Link>
      </p>
    </div>
  );
}
