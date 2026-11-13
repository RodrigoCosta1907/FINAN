import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  householdId: string | null;
};

function displayName(email: string, metadata: Record<string, unknown> | undefined) {
  const full = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";
  if (full) return full;
  const local = email.split("@")[0] ?? "você";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    name: displayName(user.email ?? "", user.user_metadata),
    householdId: membership?.household_id ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  return user;
}

/**
 * Garante um espaço financeiro para o usuário logado.
 * A criação acontece no banco (fin_create_household): household + membership +
 * pessoa + categorias padrão + conta principal, tudo em uma transação.
 */
export async function ensureHousehold(user: CurrentUser): Promise<string> {
  if (user.householdId) return user.householdId;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_create_household", {
    p_name: `Casa de ${user.name.split(" ")[0]}`,
    p_user_name: user.name,
    p_is_demo: false,
  });

  if (error || !data) {
    throw new Error(`não foi possível criar o espaço financeiro: ${error?.message ?? "sem id"}`);
  }

  return data as string;
}
