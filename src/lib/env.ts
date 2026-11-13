/**
 * Variáveis públicas do Supabase.
 * Lidas em tempo de execução (não no build) para o build passar mesmo sem
 * env e o erro, quando faltar, aparecer legível no log em vez de um 500 mudo.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. ` +
        `Configure em .env.local (desenvolvimento) ou nas Environment Variables do projeto na Vercel (produção).`,
    );
  }
  return value;
}

export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
