export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1220] p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(600px 300px at 15% 10%, rgba(37,99,235,.55), transparent 60%), radial-gradient(500px 320px at 85% 90%, rgba(124,58,237,.45), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-white/10 text-[15px] font-semibold backdrop-blur">
              F+
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Finanças+</span>
          </div>

          <h1 className="mt-16 max-w-md text-[28px] leading-tight font-semibold tracking-tight">
            Saiba exatamente para onde vai o seu dinheiro — sem planilha e sem achismo.
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-white/70">
            Caixa e competência separados, fatura de cartão que não duplica despesa, divisão de
            contas entre pessoas e projeção de saldo até 12 meses.
          </p>

          <ul className="mt-8 space-y-2.5 text-[13px] text-white/80">
            {[
              "Todo valor em centavos — nenhum erro de arredondamento",
              "Cada centavo rastreável até a parcela e a fatura de origem",
              "Seus dados isolados por espaço financeiro (RLS no banco)",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/40">
          Ambiente seguro · Supabase Auth · dados em São Paulo/região do projeto
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-primary text-[15px] font-semibold text-primary-foreground">
              F+
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Finanças+</span>
          </div>
          {children}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Seus dados ficam isolados por espaço financeiro.
          </p>
        </div>
      </main>
    </div>
  );
}
