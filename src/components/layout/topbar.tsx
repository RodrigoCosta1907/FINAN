"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonth } from "@/components/layout/month-context";
import { cn } from "@/lib/utils";

function greetingFor(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function useTheme() {
  const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("financas-theme", next ? "dark" : "light");
    } catch {
      /* modo privado */
    }
    notifyTheme();
  }

  return { dark, toggle };
}

const themeListeners = new Set<() => void>();

function notifyTheme() {
  for (const listener of themeListeners) listener();
}

function readTheme() {
  return document.documentElement.classList.contains("dark");
}

function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

function useGreeting() {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, 60_000);
      return () => clearInterval(timer);
    },
    () => greetingFor(new Date().getHours()),
    () => "Olá",
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { monthNames, monthIndex, setMonthIndex, year, setYear } = useMonth();
  const { dark, toggle } = useTheme();
  const greeting = useGreeting();
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setNotifOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={onOpenMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="hidden min-w-0 md:block">
          <p className="truncate text-[13px] text-muted-foreground">{greeting}, Rodrigo</p>
          <p className="truncate text-[15px] font-semibold tracking-tight">
            Sua saúde financeira está{" "}
            <span className="text-success">estável</span>
          </p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const q = query.trim();
              router.push(q ? `/transacoes?q=${encodeURIComponent(q)}` : "/transacoes");
            }}
            className="relative hidden sm:block"
            role="search"
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar lançamento, conta, categoria…"
              className="h-9 w-56 rounded-[10px] border border-border bg-card pr-14 pl-8 text-[13px] outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring lg:w-72"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Ctrl K
            </kbd>
          </form>

          <div className="flex items-center rounded-[10px] border border-border bg-card p-0.5">
            <select
              aria-label="Mês"
              value={monthIndex}
              onChange={(event) => setMonthIndex(Number(event.target.value))}
              className="h-8 appearance-none rounded-md bg-transparent pr-1 pl-1.5 text-[12.5px] font-medium outline-none"
            >
              {monthNames.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <span className="h-4 w-px bg-border" />
            <select
              aria-label="Ano"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-8 appearance-none rounded-md bg-transparent px-1.5 text-[12.5px] font-medium outline-none"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground hover:text-foreground"
              aria-label="Notificações"
              aria-expanded={notifOpen}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-danger ring-2 ring-card" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-pop">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                  <p className="text-[12.5px] font-semibold">Notificações</p>
                  <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                    3 novas
                  </span>
                </div>
                <ul className="divide-y divide-border text-[12.5px]">
                  <li className="px-3.5 py-2.5">
                    <p className="font-medium">Condomínio vencido há 2 dias</p>
                    <p className="text-[11.5px] text-muted-foreground">R$ 920,00 · Moradia</p>
                  </li>
                  <li className="px-3.5 py-2.5">
                    <p className="font-medium">Fatura Nubank fechou</p>
                    <p className="text-[11.5px] text-muted-foreground">R$ 1.864,20 · vence 18/11</p>
                  </li>
                  <li className="px-3.5 py-2.5">
                    <p className="font-medium">Alimentação em 93% do orçamento</p>
                    <p className="text-[11.5px] text-muted-foreground">Limite R$ 2.000,00</p>
                  </li>
                </ul>
                <Link
                  href="/configuracoes"
                  onClick={() => setNotifOpen(false)}
                  className="block border-t border-border px-3.5 py-2 text-center text-[12px] font-medium text-primary hover:bg-primary-soft"
                >
                  Configurar notificações
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={toggle}
            className="hidden h-9 w-9 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground hover:text-foreground sm:grid"
            aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link href="/transacoes?novo=1" className="inline-flex">
            <Button size="md" className="h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo lançamento</span>
            </Button>
          </Link>

          <button
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-soft text-[12px] font-semibold text-violet",
              "ring-1 ring-border",
            )}
            aria-label="Perfil de Rodrigo"
          >
            RC
          </button>
        </div>
      </div>
    </header>
  );
}
