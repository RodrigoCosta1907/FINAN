import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Troca o `code` do link de confirmação de e-mail por uma sessão.
 * É o destino do `emailRedirectTo` configurado no Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/entrar?erro=sem-codigo`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/entrar?erro=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
