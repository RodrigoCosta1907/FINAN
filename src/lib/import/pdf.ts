/**
 * Extração de texto de PDF com posição — necessária porque extrato de banco é
 * tabela, não parágrafo. Reconstrói linhas agrupando por coordenada Y e
 * ordenando por X, que é o que preserva a ordem das colunas.
 *
 * Roda só no servidor (Node). PDF protegido por senha levanta PdfPasswordError.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export class PdfPasswordError extends Error {
  constructor() {
    super("PDF protegido por senha");
    this.name = "PdfPasswordError";
  }
}

export type PdfText = {
  /** páginas → linhas visuais → células */
  pages: string[][][];
  text: string;
};

type TextItem = { str: string; transform: number[] };

/** Item de texto com posição — necessário para layouts em duas colunas. */
export type PositionedItem = { x: number; y: number; text: string };
export type PositionedPage = { width: number; height: number; items: PositionedItem[] };


/** Reconstrói linhas visuais a partir dos itens de texto (tolerância de 2pt em Y). */
export function groupLines(items: TextItem[], tolerance = 2): string[][] {
  const rows: Array<{ y: number; cells: Array<{ x: number; str: string }> }> = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5];
    const x = item.transform[4];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (row) {
      row.cells.push({ x, str: item.str });
    } else {
      rows.push({ y, cells: [{ x, str: item.str }] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.str.trim()));
}

export async function extractPdfText(data: Uint8Array, password?: string): Promise<PdfText> {
  let doc;
  try {
    doc = await pdfjs.getDocument({
      // cópia: pdfjs desanexa (transfer) o buffer recebido
      data: new Uint8Array(data),
      password,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;
  } catch (error) {
    const name = (error as { name?: string }).name ?? "";
    if (name === "PasswordException") throw new PdfPasswordError();
    throw error;
  }

  const pages: string[][][] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(groupLines(content.items as TextItem[]));
  }

  return {
    pages,
    text: pages.map((lines) => lines.map((cells) => cells.join(" ")).join("\n")).join("\n"),
  };
}

/** Extrai itens com coordenadas (x, y) por página — base para tabelas em colunas. */
export async function extractPdfItems(data: Uint8Array, password?: string): Promise<PositionedPage[]> {
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      password,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;
  } catch (error) {
    const name = (error as { name?: string }).name ?? "";
    if (name === "PasswordException") throw new PdfPasswordError();
    throw error;
  }

  const pages: PositionedPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];

    for (const raw of content.items as TextItem[]) {
      if (!raw.str || !raw.str.trim()) continue;
      items.push({ x: raw.transform[4], y: raw.transform[5], text: raw.str.trim() });
    }

    pages.push({ width: viewport.width, height: viewport.height, items });
  }

  return pages;
}

/** Junta as células de uma linha em texto único, preservando separação por " | ". */
export const lineToText = (cells: string[]): string => cells.join(" | ");

/** Aplaina as páginas em linhas de texto (uma linha por linha visual). */
export const pagesToLines = (pages: string[][][]): string[] =>
  pages.flatMap((page) => page.map((cells) => cells.join(" | ")));
