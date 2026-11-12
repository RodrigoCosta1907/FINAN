/**
 * Dinheiro é sempre inteiro em centavos. Formatação só na borda.
 * Nenhuma conta financeira passa por float.
 */
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

export function formatBRLCompact(cents: number): string {
  return brlCompact.format(cents / 100);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits).replace(".", ",")}%`;
}

export function parseBRLToCents(input: string): number | null {
  const clean = input.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Divide um valor em centavos sem perder 1 centavo no somatório. */
export function splitCents(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || total < 0 || parts < 1) {
    throw new Error("splitCents exige inteiro >= 0 e partes >= 1");
  }
  const base = Math.floor(total / parts);
  const rest = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}
