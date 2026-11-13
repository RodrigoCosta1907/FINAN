import { AppShell } from "@/components/layout/app-shell";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const householdId = await ensureHousehold(user);

  const supabase = await createClient();
  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", householdId)
    .maybeSingle();

  return (
    <AppShell userName={user.name} householdName={household?.name ?? "Meu espaço"}>
      {children}
    </AppShell>
  );
}
