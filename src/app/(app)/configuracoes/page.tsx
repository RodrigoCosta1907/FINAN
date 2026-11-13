import { LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryForm } from "@/components/settings/category-form";
import { signOut } from "@/app/(auth)/actions";
import { createCategory } from "@/server/actions/accounts";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export const instant = false;

const kindLabel: Record<string, string> = { income: "receita", expense: "despesa", both: "ambas" };

export default async function ConfiguracoesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, color, parent_id, is_system")
    .eq("is_active", true)
    .order("sort_order");

  const all = data ?? [];
  const parents = all.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => all.filter((c) => c.parent_id === id);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight">Configurações</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Categorias, conta e integrações do seu espaço financeiro.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
            <span className="text-[11px] text-muted-foreground">{all.length} ativas</span>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="space-y-1.5">
              {parents.map((parent) => (
                <li key={parent.id}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: parent.color }} />
                    <span className="font-medium">{parent.name}</span>
                    <Badge tone="neutral">{kindLabel[parent.kind] ?? parent.kind}</Badge>
                  </div>
                  {childrenOf(parent.id).length > 0 && (
                    <ul className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
                      {childrenOf(parent.id).map((child) => (
                        <li key={child.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: child.color }} />
                          {child.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Nova categoria</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <CategoryForm action={createCategory} parents={parents} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-1">
              <p className="text-[12.5px]">{user.email}</p>
              <p className="text-[11.5px] text-muted-foreground">
                Espaço financeiro {user.householdId ? "ativo" : "não provisionado"}
              </p>
              <div className="rounded-[10px] border border-border bg-subtle px-3 py-2 text-[11.5px] text-muted-foreground">
                <p className="font-medium text-foreground">Telegram</p>
                <p>
                  Lance por mensagem no <span className="font-medium">@FinancasPlusRodrigo_bot</span>:
                  <br />
                  <code>25 padaria</code> · <code>+1500 salário</code>
                </p>
              </div>
              <form action={signOut}>
                <Button variant="outline" size="sm" type="submit">
                  <LogOut className="h-3.5 w-3.5" />
                  Sair da conta
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
