import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/import/pdf";
import { parseNubankInvoice } from "@/lib/import/nubank";
import { pagesToLines } from "@/lib/import/pdf";
import { prepareInvoiceImport } from "@/lib/import/prepare";

/**
 * Autoteste do leitor de PDF em produção (serverless).
 * Só responde com o segredo do webhook do Telegram e devolve apenas números —
 * nenhuma descrição, valor ou nome de estabelecimento sai daqui.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || request.headers.get("x-selftest") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const buffer = new Uint8Array(await request.arrayBuffer());
    if (!buffer.length) return NextResponse.json({ error: "corpo vazio" }, { status: 400 });

    const { text, pages } = await extractPdfText(buffer);

    let rows = 0;
    let totalCents = 0;
    let issuer = "desconhecido";

    if (/nubank|nu pagamentos/i.test(text)) {
      issuer = "nubank";
      const prepared = prepareInvoiceImport(parseNubankInvoice(pagesToLines(pages)));
      rows = prepared.rows.length;
      totalCents = prepared.totalCents;
    } else if (/ita[uú]/i.test(text)) {
      issuer = "itau";
      const { extractPdfItems } = await import("@/lib/import/pdf");
      const { parseItauInvoice } = await import("@/lib/import/itau");
      const prepared = prepareInvoiceImport(parseItauInvoice(await extractPdfItems(buffer), text));
      rows = prepared.rows.length;
      totalCents = prepared.totalCents;
    }

    return NextResponse.json({
      ok: true,
      pdfjs: "carregado",
      pages: pages.length,
      chars: text.length,
      issuer,
      rows,
      totalCents,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, name: (error as Error).name },
      { status: 500 },
    );
  }
}
