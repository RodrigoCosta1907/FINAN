import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ImportForm } from "@/components/import/import-form";

export const instant = false;

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export default async function ImportarPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; skipped?: string; total?: string; erro?: string }>;
}) {
  const { ok, skipped, total, erro } = await searchParams;

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight">Importar fatura</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          PDF do cartão (Nubank, Itaú/VISA). Você vê tudo antes de gravar — e reimportar não duplica.
        </p>
      </header>

      {ok !== undefined && (
        <div className="flex items-start gap-2 rounded-[12px] border border-success/30 bg-success-soft px-3 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {ok} lançamento(s) importado(s) · {brl(Number(total ?? 0))}
            </p>
            {Number(skipped ?? 0) > 0 && (
              <p className="text-[11.5px]">
                {skipped} já existia(m) e não foi(ram) duplicado(s).
              </p>
            )}
          </div>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-[12px] border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{decodeURIComponent(erro)}</p>
        </div>
      )}

      <ImportForm />
    </div>
  );
}
