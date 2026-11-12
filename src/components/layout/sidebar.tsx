"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Settings, X } from "lucide-react";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop mobile */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-border bg-sidebar transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navegação principal"
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-primary text-[15px] font-semibold text-primary-foreground shadow-sm">
            F+
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight">Finanças+</p>
            <p className="truncate text-[11px] text-muted-foreground">Gestão financeira pessoal</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-3 mb-3 flex items-center gap-2 rounded-[10px] border border-border bg-subtle px-3 py-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-violet-soft text-[11px] font-semibold text-violet">
            CS
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium">Casa</p>
            <p className="truncate text-[10.5px] text-muted-foreground">Espaço compartilhado</p>
          </div>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            2
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <ul className="space-y-0.5">
            {modules.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.slug}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] transition-colors",
                      active
                        ? "bg-primary-soft font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground/80")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2 rounded-[10px] px-2 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-soft text-[11px] font-semibold text-violet">
              RC
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">Rodrigo</p>
              <p className="truncate text-[10.5px] text-muted-foreground">Espaço pessoal</p>
            </div>
            <Link
              href="/configuracoes"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Configurações"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex items-center gap-2 rounded-[10px] bg-primary-soft px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium">Fase 1 · fundação</p>
              <p className="truncate text-[10px] text-muted-foreground">Schema e RLS verificados</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
