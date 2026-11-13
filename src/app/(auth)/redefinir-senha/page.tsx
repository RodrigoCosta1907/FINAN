import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { updatePassword } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Nova senha" };
export const instant = false;

export default function RedefinirSenhaPage() {
  return <ResetPasswordForm action={updatePassword} />;
}
