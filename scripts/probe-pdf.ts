/**
 * Sonda de PDF real: extrai, identifica o layout e mostra o que será importado.
 *   node --experimental-strip-types scripts/probe-pdf.ts "C:/caminho/fatura.pdf"
 *   PDF_PASSWORD=... (opcional) para PDF protegido
 */
import { readFileSync } from "node:fs";
import { extractPdfText, pagesToLines, PdfPasswordError } from "../src/lib/import/pdf.ts";
import { parseNubankInvoice } from "../src/lib/import/nubank.ts";

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

  if (!/nubank|nu pagamentos/i.test(text)) {
    console.log("  layout não reconhecido (por enquanto só Nubank)");
    process.exit(0);
  }

  const invoice = parseNubankInvoice(pagesToLines(pages));
  console.log(`  vencimento: ${invoice.dueDate} · período: ${invoice.periodStart} a ${invoice.periodEnd}`);
  console.log(`  total da fatura: ${invoice.totalCents !== null ? brl(invoice.totalCents) : "—"} · compras: ${brl(invoice.purchasesCents)}`);
  console.log(`  pagamento recebido: ${invoice.paymentCents !== null ? brl(invoice.paymentCents) : "—"} · limite: ${invoice.limitCents !== null ? brl(invoice.limitCents) : "—"}`);
  console.log(`  ${invoice.rows.length} compra(s):`);
  for (const row of invoice.rows) {
    const parcela = row.installment ? ` [${row.installment.number}/${row.installment.total}]` : "";
    console.log(`   ${row.date}  ${(row.cardEnding ?? "----").padStart(4)}  ${brl(row.amountCents).padStart(9)}  ${row.description}${parcela}`);
  }
  for (const warning of invoice.warnings) console.log(`  ! ${warning}`);
} catch (error) {
  if (error instanceof PdfPasswordError) {
    console.log("  PDF PROTEGIDO POR SENHA — precisa de uma cópia sem proteção");
  } else {
    console.log(`  erro: ${(error as Error).message}`);
  }
  process.exit(1);
}
