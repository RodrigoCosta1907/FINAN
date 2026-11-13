/**
 * Leitor de fatura de cartão em PDF (layout Itaú / VISA).
 *
 * A lista de lançamentos do Itaú vem em DUAS colunas paralelas na mesma página:
 *   DATA | ESTABELECIMENTO | VALOR EM R$     DATA | ESTABELECIMENTO | VALOR EM R$
 * e a linha de baixo traz categoria + cidade ("mercado SALVADOR").
 *
 * Então não basta agrupar por Y: é preciso separar as colunas por X antes de
 * reconstruir as linhas, ou os dois lançamentos da mesma altura se misturam.
 */
import type { PositionedItem, PositionedPage } from "./pdf.ts";
import { parseAmountToCents } from "./core.ts";
import type { CardInvoice, InvoiceRow } from "./nubank.ts";

const COLUMN_SPLIT_RATIO = 0.55; // gutter do Itaú fica ~ x=330 de 595

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Data sem ano: usa o vencimento como âncora (até 12 meses antes). */
export function resolveYearByDue(day: number, month: number, dueDate: string | null): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const reference = dueDate ? Number(dueDate.slice(0, 4)) : new Date().getFullYear();
  const due = dueDate ?? `${reference}-12-31`;

  for (const year of [reference, reference - 1]) {
    const date = iso(year, month, day);
    if (date <= due) return date;
  }
  return iso(reference - 1, month, day);
}

type ColumnLine = { y: number; cells: PositionedItem[] };

function groupColumn(items: PositionedItem[], tolerance = 3): ColumnLine[] {
  const lines: ColumnLine[] = [];
  for (const item of items) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (line) line.cells.push(item);
    else lines.push({ y: item.y, cells: [item] });
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => ({ ...line, cells: line.cells.sort((a, b) => a.x - b.x) }));
}

const DATE_LINE = /^(\d{2})\/(\d{2})\b/;
const INSTALLMENT = /(\d{2})\/(\d{2})$/;
const MONEY_TAIL = /(-?[\d.]+,\d{2})\s*$/;

/**
 * Extrai lançamentos de uma coluna.
 * Linha com data e valor = transação; linha sem data = categoria/cidade da anterior.
 */
function parseColumn(lines: ColumnLine[], dueDate: string | null, stopAt?: RegExp): InvoiceRow[] {
  const rows: InvoiceRow[] = [];

  for (const line of lines) {
    const text = line.cells.map((cell) => cell.text).join(" ").replace(/\s+/g, " ").trim();

    // "Compras parceladas - próximas faturas" é projeção, não despesa desta fatura
    if (stopAt?.test(text)) break;

    const dateMatch = DATE_LINE.exec(text);

    if (!dateMatch) {
      // continuação: "mercado SALVADOR" — não é transação
      continue;
    }

    const moneyMatch = MONEY_TAIL.exec(text);
    if (!moneyMatch) continue;

    const amountCents = parseAmountToCents(moneyMatch[1]);
    if (amountCents === null || amountCents === 0) continue;

    const description = text
      .slice(dateMatch[0].length, text.length - moneyMatch[0].length)
      .replace(/^[\s|]+|[\s|]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!description) continue;

    const date = resolveYearByDue(Number(dateMatch[1]), Number(dateMatch[2]), dueDate);
    if (!date) continue;

    const installment = INSTALLMENT.exec(description);
    // negativo só é pagamento quando a descrição diz isso; o resto é estorno/redução
    const isPayment = /^pagamento/i.test(description);

    rows.push({
      date,
      cardEnding: null,
      description: installment
        ? description.slice(0, installment.index).trim() || description
        : description,
      amountCents,
      isPayment,
      installment: installment
        ? { number: Number(installment[1]), total: Number(installment[2]) }
        : null,
    });
  }

  return rows;
}

export function parseItauInvoice(pages: PositionedPage[], fullText: string): CardInvoice {
  const warnings: string[] = [];
  const lines = fullText.split("\n");

  /**
   * Valor de um rótulo: na mesma linha depois de "|" ou, quando o layout joga o
   * número para a linha seguinte (Limite de crédito), nas duas linhas abaixo.
   */
  const valueOf = (label: RegExp, lineOffset = 0): string | null => {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(lines[index])) continue;
      for (let shift = lineOffset; shift <= lineOffset + 2; shift += 1) {
        const line = lines[index + shift];
        if (!line) continue;
        const numbers = [...line.matchAll(/(-?R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g)];
        if (numbers.length) return numbers[numbers.length - 1][2];
      }
    }
    return null;
  };

  const toCents = (value: string | null) => (value ? parseAmountToCents(value) : null);

  const dueRaw = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(fullText);
  const dueDate = dueRaw ? `${dueRaw[3]}-${dueRaw[2]}-${dueRaw[1]}` : null;

  const totalCents = toCents(valueOf(/total desta fatura/i));
  const currentChargesCents = toCents(valueOf(/lan[çc]amentos atuais/i));
  const previousBalanceCents = toCents(valueOf(/total da fatura anterior/i));

  const paymentMatch = /pagamento efetuado em [\d/]+[^\d-]*-([\d.,]+)/i.exec(fullText);
  const paymentCents = paymentMatch ? toCents(paymentMatch[1]) : null;

  const limitCents = toCents(valueOf(/limite total de cr[ée]dito/i, 1));
  const cardMask = /cart[ãa]o\s*\|\s*([\dX.\s]+)/i.exec(fullText)?.[1] ?? null;
  const cardEnding = cardMask ? cardMask.replace(/\D/g, "").slice(-4) : null;

  const rows: InvoiceRow[] = [];
  const STOP = /compras parceladas|pr[óo]ximas faturas/i;
  for (const page of pages) {
    const split = page.width * COLUMN_SPLIT_RATIO;
    const left = page.items.filter((item) => item.x < split);
    const right = page.items.filter((item) => item.x >= split);

    for (const column of [left, right]) {
      if (!column.some((item) => DATE_LINE.test(item.text))) continue;
      for (const row of parseColumn(groupColumn(column), dueDate, STOP)) {
        rows.push({ ...row, cardEnding });
      }
    }
  }

  const purchases = rows.filter((row) => !row.isPayment);
  const purchasesCents = purchases.reduce((sum, row) => sum + row.amountCents, 0);

  if (!rows.length) warnings.push("nenhum lançamento encontrado no PDF");
  if (currentChargesCents !== null && purchases.length && purchasesCents !== currentChargesCents) {
    const diff = purchasesCents - currentChargesCents;
    warnings.push(
      `soma das compras (${(purchasesCents / 100).toFixed(2)}) difere de "Lançamentos atuais" ` +
        `(${(currentChargesCents / 100).toFixed(2)}): ${(diff / 100).toFixed(2)}`,
    );
  }

  return {
    issuer: "itau",
    kind: "card_invoice",
    dueDate,
    periodStart: null,
    periodEnd: null,
    totalCents: totalCents ?? currentChargesCents,
    previousBalanceCents,
    paymentCents,
    limitCents,
    purchasesCents,
    rows,
    warnings,
  };
}
