import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findModule, modules } from "@/lib/modules";

export function generateStaticParams() {
  return modules.filter((m) => m.href !== "/").map((m) => ({ module: m.slug }));
}

const foundation = [
  "36 tabelas com chaves, índices e constraints de integridade",
  "RLS por espaço financeiro (owner/admin/member/viewer) testada com 2 usuários",
  "Rateio de centavos, fatura de cartão e pagamento sem duplicar despesa",
  "Divisão de despesas compartilhadas e acerto mínimo de contas",
  "Dashboard, projeção de caixa e score calculados no banco",
];

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  const mod = findModule(slug);
  if (!mod) notFound();

  const Icon = mod.icon;

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Visão geral
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-primary-soft text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight">{mod.label}</h1>
              <Badge tone="warning">Fase {mod.phase}</Badge>
            </div>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted-foreground">{mod.summary}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>O que este módulo entrega</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="space-y-2">
              {mod.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-[13px]">
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-[10px] border border-border bg-subtle px-3 py-2.5 text-[12px] text-muted-foreground">
              Tela prevista para a fase {mod.phase}. A navegação já funciona e o modelo de dados que
              sustenta esta tela já está criado e testado no banco — falta a camada de UI e as
              Server Actions deste módulo.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Já pronto no projeto</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="space-y-2">
              {foundation.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
