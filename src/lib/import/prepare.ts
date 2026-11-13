/**
 * Transforma o que o PDF diz em linhas prontas para gravar.
 *
 * Regras (todas verificáveis):
 *  - pagamento da fatura não é compra: fica de fora;
 *  - "produtos e serviços" é lançado pelo líquido, como o próprio banco faz
 *    ("Lançamentos produtos e serviços 0,00"): mensalidade 44,00 − 22,00 − 22,00;
 *    crédito que sobra sozinho não entra (installments.amount_cents > 0);
 *  - cada linha vira compra de 1 parcela na fatura atual: o passado não é
 *    inventado e a próxima fatura traz as suas parcelas.
 */
import { fingerprint, normalizeDescription } from "./core.ts";
import type { CardInvoice, InvoiceRow } from "./nubank.ts";

export type ImportRow = {
  fingerprint: string;
  card_end: string | null;
  date: string;
  description: string;
  amount_cents: number;
  installment_number: number | null;
  installment_total: number | null;
};

export type PreparedImport = {
  issuer: string;
  dueDate: string;
  rows: ImportRow[];
  totalCents: number;
  invoiceTotalCents: number | null;
  differenceCents: number | null;
  paymentsSkippedCents: number;
  creditsSkippedCents: number;
  warnings: string[];
};

export function prepareInvoiceImport(invoice: CardInvoice): PreparedImport {
  const warnings: string[] = [];
  if (!invoice.dueDate) {
    return {
      issuer: invoice.issuer,
      dueDate: "",
      rows: [],
      totalCents: 0,
      invoiceTotalCents: invoice.totalCents,
      differenceCents: null,
      paymentsSkippedCents: 0,
      creditsSkippedCents: 0,
      warnings: ["fatura sem vencimento — não é possível amarrar o ciclo"],
    };
  }

  const rows: ImportRow[] = [];
  const occurrence = new Map<string, number>();
  let paymentsSkippedCents = 0;
  let creditsSkippedCents = 0;

  const push = (row: InvoiceRow, amountCents: number, description = row.description) => {
    const key = `${row.cardEnding ?? ""}|${row.date}|${amountCents}|${normalizeDescription(description)}`;
    const nth = (occurrence.get(key) ?? 0) + 1;
    occurrence.set(key, nth);

    rows.push({
      fingerprint: fingerprint(row.cardEnding ?? invoice.issuer, {
        date: row.date,
        amountCents,
        description,
      }, nth),
      card_end: row.cardEnding,
      date: row.date,
      description: description.slice(0, 120),
      amount_cents: amountCents,
      installment_number: row.installment?.number ?? null,
      installment_total: row.installment?.total ?? null,
    });
  };

  const services: InvoiceRow[] = [];

  for (const row of invoice.rows) {
    if (row.isPayment) {
      paymentsSkippedCents += Math.abs(row.amountCents);
      continue;
    }
    if (row.section === "services") {
      services.push(row);
      continue;
    }
    if (row.amountCents > 0) push(row, row.amountCents);
    else creditsSkippedCents += row.amountCents;
  }

  if (services.length) {
    const net = services.reduce((sum, row) => sum + row.amountCents, 0);
    if (net > 0) {
      const last = services[services.length - 1];
      push({ ...last, installment: null, description: "Produtos e serviços (líquido)" }, net);
      warnings.push(`produtos e serviços lançados pelo líquido: ${(net / 100).toFixed(2)}`);
    } else if (net < 0) {
      creditsSkippedCents += net;
      warnings.push(`produtos e serviços com crédito líquido de ${(net / 100).toFixed(2)} — não importado`);
    }
  }

  if (creditsSkippedCents < 0) {
    warnings.push(`créditos (estornos/reduções) não importados: ${(-creditsSkippedCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if (paymentsSkippedCents > 0) {
    warnings.push(`pagamento da fatura fora da importação: ${(paymentsSkippedCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  const differenceCents = invoice.totalCents !== null ? totalCents - invoice.totalCents : null;

  if (differenceCents !== null && differenceCents !== 0) {
    warnings.push(
      `soma a importar (${(totalCents / 100).toFixed(2)}) difere do total da fatura ` +
        `(${((invoice.totalCents as number) / 100).toFixed(2)}): ${(differenceCents / 100).toFixed(2)}`,
    );
  }

  return {
    issuer: invoice.issuer,
    dueDate: invoice.dueDate,
    rows,
    totalCents,
    invoiceTotalCents: invoice.totalCents,
    differenceCents,
    paymentsSkippedCents,
    creditsSkippedCents,
    warnings,
  };
}
