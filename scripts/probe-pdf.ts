/**
 * Sonda de PDF real: extrai, identifica o layout e mostra o que será importado.
 *   node --experimental-strip-types scripts/probe-pdf.ts "C:/caminho/fatura.pdf"
 *   PDF_PASSWORD=... (opcional) para PDF protegido
 */
import { readFileSync } from "node:fs";
import { extractPdfItems, extractPdfText, pagesToLines, PdfPasswordError } from "../src/lib/import/pdf.ts";
import { parseNubankInvoice } from "../src/lib/import/nubank.ts";
import { parseItauInvoice } from "../src/lib/import/itau.ts";
import { prepareInvoiceImport } from "../src/lib/import/prepare.ts";

const file = process.argv[2];
if (!file) {
  console.log("uso: probe-pdf.ts <arquivo.pdf>");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(file));
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

try {
  const { pages, text } = await extractPdfText(data, process.env.PDF_PASSWORD);
  console.log(`${file}\n  páginas: ${pages.length} · ${text.length} caracteres`);

  let invoice;
  if (/nubank|nu pagamentos/i.test(text)) {
    invoice = parseNubankInvoice(pagesToLines(pages));
  } else if (/ita[uú]/i.test(text) || /itau\.com\.br/i.test(text)) {
    invoice = parseItauInvoice(await extractPdfItems(data, process.env.PDF_PASSWORD), text);
  } else {
    console.log("  layout não reconhecido");
    process.exit(0);
  }

  console.log(`  emissor: ${invoice.issuer} · vencimento: ${invoice.dueDate ?? "—"}`);
  if (invoice.periodStart) console.log(`  período: ${invoice.periodStart} a ${invoice.periodEnd}`);
  console.log(`  total desta fatura: ${invoice.totalCents !== null ? brl(invoice.totalCents) : "—"} · compras: ${brl(invoice.purchasesCents)}`);
  console.log(`  anterior: ${invoice.previousBalanceCents !== null ? brl(invoice.previousBalanceCents) : "—"} · pagamento: ${invoice.paymentCents !== null ? brl(invoice.paymentCents) : "—"} · limite: ${invoice.limitCents !== null ? brl(invoice.limitCents) : "—"}`);
  const compras = invoice.rows.filter((row) => !row.isPayment);
  console.log(`  ${compras.length} compra(s):`);
  for (const row of compras) {
    const parcela = row.installment ? ` [${row.installment.number}/${row.installment.total}]` : "";
    console.log(`   ${row.date}  ${(row.cardEnding ?? "----").padStart(4)}  ${brl(row.amountCents).padStart(9)}  ${row.description}${parcela}`);
  }
  for (const warning of invoice.warnings) console.log(`  ! ${warning}`);

  const prepared = prepareInvoiceImport(invoice);
  console.log(`\n  VAI GRAVAR: ${prepared.rows.length} linha(s) · ${brl(prepared.totalCents)}`);
  console.log(
    `  total da fatura: ${prepared.invoiceTotalCents !== null ? brl(prepared.invoiceTotalCents) : "—"} · ` +
      `diferença: ${prepared.differenceCents !== null ? brl(prepared.differenceCents) : "—"}`,
  );
  console.log(
    `  fora: pagamento ${brl(prepared.paymentsSkippedCents)} · créditos ${brl(prepared.creditsSkippedCents)}`,
  );
  for (const warning of prepared.warnings) console.log(`  > ${warning}`);
} catch (error) {
  if (error instanceof PdfPasswordError) {
    console.log("  PDF PROTEGIDO POR SENHA — precisa de uma cópia sem proteção");
  } else {
    console.log(`  erro: ${(error as Error).message}`);
  }
  process.exit(1);
}
