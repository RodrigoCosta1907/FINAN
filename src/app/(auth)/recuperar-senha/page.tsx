import type { Metadata } from "next";
import { EmailForm } from "@/components/auth/email-form";
import { requestPasswordReset } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Recuperar senha" };
export const instant = false;

export default function RecuperarSenhaPage() {
  return (
    <EmailForm
      action={requestPasswordReset}
      title="Recuperar senha"
      description="Informe o e-mail da conta. Enviamos um link para você definir uma nova senha."
      submitLabel="Enviar link"
    />
  );
}
