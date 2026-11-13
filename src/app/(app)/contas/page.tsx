import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountForm } from "@/components/accounts/account-form";
import { createAccount, toggleAccount } from "@/server/actions/accounts";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";

export const instant = false;

const typeLabel: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Carteira",
  digital: "Conta digital",
  joint: "Conjunta",
  investment: "Investimentos",
};

export default async function ContasPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_account_balances")
    .select("account_id, name, type, is_active, opening_balance_cents, balance_cents")
    .order("is_active", { ascending: false })
    .order("name");

  const accounts = data ?? [];
  const total = accounts.filter((a) => a.is_active).reduce((acc, a) => acc + Number(a.balance_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Contas</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Saldo = saldo inicial + tudo que foi efetivado. Transferência entre contas não é receita nem despesa.
          </p>
        </div>
        <Badge tone="primary">Saldo total {formatBRL(total)}</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Suas contas</CardTitle>
            <span className="text-[11px] text-muted-foreground">{accounts.length} cadastrada(s)</span>
          </CardHeader>
          <CardContent className="pt-1">
            {accounts.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                Nenhuma conta ainda. Crie a primeira ao lado.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {accounts.map((account) => (
                  <li key={account.account_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-medium">{account.name}</p>
                        {!account.is_active && <Badge tone="neutral">inativa</Badge>}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">
                        {typeLabel[account.type] ?? account.type} · inicial {formatBRL(Number(account.opening_balance_cents ?? 0))}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums">
                      {formatBRL(Number(account.balance_cents ?? 0))}
                    </span>
                    <form action={toggleAccount}>
                      <input type="hidden" name="id" value={account.account_id} />
                      <input type="hidden" name="active" value={account.is_active ? "1" : "0"} />
                      <Button variant="ghost" size="sm" type="submit">
                        {account.is_active ? "Desativar" : "Ativar"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nova conta</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <AccountForm action={createAccount} />
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Usuário: {user.email}
      </p>
    </div>
  );
}
