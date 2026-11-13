"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { extractPdfItems, extractPdfText, pagesToLines, PdfPasswordError } from "@/lib/import/pdf";
import { parseNubankInvoice } from "@/lib/import/nubank";
import { parseItauInvoice } from "@/lib/import/itau";
import { prepareInvoiceImport, type PreparedImport } from "@/lib/import/prepare";

export type PreviewState = {
  error?: string;
  prepared?: PreparedImport;
  fileName?: string;
};

const MAX_BYTES = 8 * 1024 * 1024;

export async function previewInvoice(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireUser();

  const file = formData.get("file");
  const password = String(formData.get("password") ?? "") || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolha o PDF da fatura." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Arquivo acima de 8 MB." };
  }

  const data = new Uint8Array(await file.arrayBuffer());

  try {
    const { text, pages } = await extractPdfText(data, password);

    let invoice;
    if (/nubank|nu pagamentos/i.test(text)) {
      invoice = parseNubankInvoice(pagesToLines(pages));
    } else if (/ita[uú]/i.test(text)) {
      invoice = parseItauInvoice(await extractPdfItems(data, password), text);
    } else {
      return { error: "Não reconheci o layout deste PDF (por enquanto Nubank e Itaú/VISA)." };
    }

    if (!invoice.rows.length) {
      return { error: "Nenhum lançamento encontrado no PDF." };
    }

    const prepared = prepareInvoiceImport(invoice);
    if (!prepared.dueDate) {
      return { error: "Fatura sem data de vencimento — não consigo amarrar o ciclo." };
    }
    if (!prepared.rows.length) {
      return { error: "Só encontrei pagamento/crédito nesta fatura — nada a importar." };
    }

    return { prepared, fileName: file.name };
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      return { error: "PDF protegido por senha. Informe a senha do arquivo acima." };
    }
    return { error: `Não consegui ler o PDF: ${(error as Error).message}` };
  }
}

const payloadSchema = z.object({
  issuer: z.string(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        fingerprint: z.string().min(8),
        card_end: z.string().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1).max(120),
        amount_cents: z.number().int().positive(),
        installment_number: z.number().int().nullable(),
        installment_total: z.number().int().nullable(),
      }),
    )
    .min(1),
});

export async function confirmImport(formData: FormData): Promise<void> {
  const user = await requireUser();
  const householdId = await ensureHousehold(user);

  const raw = String(formData.get("payload") ?? "");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    redirect("/importar?erro=payload");
  }

  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    redirect("/importar?erro=payload");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_import_invoice_rows", {
    p_household: householdId,
    p_issuer: parsed.data.issuer,
    p_due_date: parsed.data.dueDate,
    p_rows: parsed.data.rows,
  });

  if (error) {
    redirect(`/importar?erro=${encodeURIComponent(error.message)}`);
  }

  const summary = data as { inserted: number; skipped: number; total_cents: number } | null;

  for (const path of ["/", "/transacoes", "/cartoes", "/compras-parceladas", "/importar"]) {
    revalidatePath(path);
  }

  redirect(
    `/importar?ok=${summary?.inserted ?? 0}&skipped=${summary?.skipped ?? 0}&total=${summary?.total_cents ?? 0}`,
  );
}
