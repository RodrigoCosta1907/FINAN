/**
 * Leitor de fatura de cartão em PDF (layout Nubank).
 *
 * O texto vem em linhas reconstruídas por posição, no formato:
 *   09 OUT | •••• 8481 | Vindi *Kinghost - Parcela 8/11 | R$ 15,28
 *   15 OUT | Pagamento em 15 OUT | −R$ 1.331,55
 *
 * Datas vêm sem ano: o ano é resolvido pelo período vigente ("09 OUT a 09 NOV").
 */
import { parseAmountToCents } from "./core.ts";

export type InvoiceRow = {
  date: string;
  cardEnding: string | null;
  description: string;
  amountCents: number;
  isPayment: boolean;
  installment: { number: number; total: number } | null;
};

export type CardInvoice = {
  issuer: "nubank" | "itau";
  kind: "card_invoice";
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number | null;
  previousBalanceCents: number | null;
  paymentCents: number | null;
  limitCents: number | null;
  purchasesCents: number;
  rows: InvoiceRow[];
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const pad = (value: number) => String(value).padStart(2, "0");

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Resolve o ano de uma data sem ano usando o período da fatura. */
export function resolveYear(
  day: number,
  month: number,
  referenceYear: number,
  period: { start: string; end: string } | null,
): string {
  const candidates = [referenceYear - 1, referenceYear, referenceYear + 1];
  if (period) {
    const hit = candidates
      .map((year) => iso(year, month, day))
      .find((date) => date >= period.start && date <= period.end);
    if (hit) return hit;
  }
  return iso(referenceYear, month, day);
}

// PDF do Nubank usa menos tipográfico (− U+2212) nos pagamentos
const TRANSACTION =
  /^(\d{2})\s+([A-Z]{3})\s*\|\s*(?:••+ ?(\d{4})\s*\|\s*)?(.+?)\s*\|\s*([\-\u2212\u2013\u2014]?R\$\s*[\d.,]+)$/;

export function parseNubankInvoice(lines: string[]): CardInvoice {
  const warnings: string[] = [];
  const rows: InvoiceRow[] = [];

  let dueDate: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let totalCents: number | null = null;
  let previousBalanceCents: number | null = null;
  let paymentCents: number | null = null;
  let limitCents: number | null = null;

  const dueMatch = lines.map((line) => /vencimento:\s*(\d{2})\s+([A-Z]{3})\s+(\d{4})/i.exec(line)).find(Boolean);
  if (dueMatch) {
    const month = MONTHS[dueMatch[2].toUpperCase()];
    if (month) dueDate = iso(Number(dueMatch[3]), month, Number(dueMatch[1]));
  }

  const periodMatch = lines
    .map((line) => /per[ií]odo vigente:\s*(\d{2})\s+([A-Z]{3})\s*a\s*(\d{2})\s+([A-Z]{3})/i.exec(line))
    .find(Boolean);
  const referenceYear = dueDate ? Number(dueDate.slice(0, 4)) : new Date().getFullYear();

  if (periodMatch) {
    const startMonth = MONTHS[periodMatch[2].toUpperCase()];
    const endMonth = MONTHS[periodMatch[4].toUpperCase()];
    const startYear = startMonth > endMonth ? referenceYear - 1 : referenceYear;
    if (startMonth) periodStart = iso(startYear, startMonth, Number(periodMatch[1]));
    if (endMonth) periodEnd = iso(referenceYear, endMonth, Number(periodMatch[3]));
  } else {
    warnings.push("período vigente não encontrado — datas usam o ano do vencimento");
  }

  // "Limite total do cartão de crédito: R$ 10.700,00" é o valor confiável;
  // a tabela de limites mostra "Utilizado / Disponível / Limite total" fora de ordem.
  const limitLine = lines.find((line) => /limite total do cart[ãa]o/i.test(line));
  const limitNumbers = limitLine ? [...limitLine.matchAll(/R\$\s*([\d.,]+)/g)].map((m) => m[1]) : [];
  if (limitNumbers.length) {
    limitCents = parseAmountToCents(limitNumbers[0]);
  } else {
    const fallbackLine = lines.find((line) => /limite total/i.test(line));
    const fallbackNumbers = fallbackLine ? [...fallbackLine.matchAll(/R\$\s*([\d.,]+)/g)].map((m) => m[1]) : [];
    if (fallbackNumbers.length) limitCents = parseAmountToCents(fallbackNumbers[fallbackNumbers.length - 1]);
  }

  const totalMatch = lines.map((line) => /no valor de\s*R\$\s*([\d.,]+)/i.exec(line)).find(Boolean);
  if (totalMatch) totalCents = parseAmountToCents(totalMatch[1]);

  const previousMatch = lines.map((line) => /fatura anterior\s*\|\s*R\$\s*([\d.,]+)/i.exec(line)).find(Boolean);
  if (previousMatch) previousBalanceCents = parseAmountToCents(previousMatch[1]);

  // As transações só valem depois do cabeçalho da seção ("TRANSAÇÕES DE ...");
  // antes disso há valores de resumo (fatura anterior, mínimo, parcelamento).
  const sectionIndex = lines.findIndex((line) => /^\s*transa[cç][oõ]es/i.test(line));
  const startIndex = sectionIndex >= 0 ? sectionIndex : 0;

  for (const line of lines.slice(startIndex)) {
    const match = TRANSACTION.exec(line);
    if (!match) continue;

    const [, day, monthText, ending, description, amountText] = match;
    const month = MONTHS[monthText.toUpperCase()];
    if (!month) continue;

    const amountCents = parseAmountToCents(amountText);
    if (amountCents === null) continue;

    const period = periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null;
    const date = resolveYear(Number(day), month, referenceYear, period);
    const isPayment = /^pagamento/i.test(description);
    const installmentMatch = /-\s*parcela\s+(\d+)\s*\/\s*(\d+)/i.exec(description);

    if (isPayment) {
      paymentCents = (paymentCents ?? 0) + Math.abs(amountCents);
      continue;
    }

    rows.push({
      date,
      cardEnding: ending ?? null,
      description: description.replace(/\s*-\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, "").trim(),
      amountCents: Math.abs(amountCents),
      isPayment: false,
      installment: installmentMatch
        ? { number: Number(installmentMatch[1]), total: Number(installmentMatch[2]) }
        : null,
    });
  }

  if (!rows.length) warnings.push("nenhuma compra encontrada no PDF");

  const purchasesCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  if (totalCents !== null && rows.length && purchasesCents !== totalCents && paymentCents === null) {
    warnings.push(`soma das compras (${purchasesCents}) difere do total da fatura (${totalCents})`);
  }

  return {
    issuer: "nubank",
    kind: "card_invoice",
    dueDate,
    periodStart,
    periodEnd,
    totalCents,
    previousBalanceCents,
    paymentCents,
    limitCents,
    purchasesCents,
    rows,
    warnings,
  };
}
