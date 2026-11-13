/**
 * Núcleo de importação de extratos — sem UI, sem banco.
 *
 * Resolve os cinco bloqueios que quebram importação de extrato brasileiro:
 *  1. encoding (UTF-8 com BOM, UTF-8 puro, latin1/Windows-1252)
 *  2. delimitador (;, , ou tab) e aspas
 *  3. linhas de preâmbulo antes do cabeçalho
 *  4. valor com separador de milhar, "D"/"C", parênteses, R$
 *  5. data em dd/mm/aaaa, dd/mm e aaaa-mm-dd
 * E o sexto: duplicidade. O fingerprint é estável entre execuções (mesmo
 * arquivo = mesmas chaves) mas distingue duas compras iguais no mesmo dia
 * (contador de ocorrência).
 */
import { createHash } from "node:crypto";

export type RawRow = { date: string; amountCents: number; description: string; externalId?: string };

export type ParsedStatement = {
  format: "ofx" | "csv" | "delimiter" | "desconhecido";
  encoding: "utf-8" | "utf-8-bom" | "latin1";
  delimiter: string | null;
  headerIndex: number | null;
  columns: { date: number; amount: number; description: number } | null;
  rows: RawRow[];
  warnings: string[];
};

// ------------------------------------------------------------------ encoding --
export function decodeBuffer(input: Uint8Array): { text: string; encoding: ParsedStatement["encoding"] } {
  const hasBom = input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf;
  const body = hasBom ? input.subarray(3) : input;

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const broken = (utf8.match(/\uFFFD/g) ?? []).length;

  if (broken === 0) {
    return { text: utf8, encoding: hasBom ? "utf-8-bom" : "utf-8" };
  }
  return { text: new TextDecoder("windows-1252").decode(body), encoding: "latin1" };
}

// -------------------------------------------------------------------- valores --
export function parseAmountToCents(raw: string): number | null {
  if (raw == null) return null;
  let text = String(raw).trim();
  if (!text) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }

  const suffix = /(?:^|\s)([DC])$/i.exec(text);
  if (suffix) {
    if (suffix[1].toUpperCase() === "D") sign = -1;
    text = text.slice(0, suffix.index).trim();
  }

  text = text.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (text.startsWith("-")) {
    sign = -1;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  // 1.234,56 → 1234.56 · 1234.56 → 1234.56 · 1234 → 1234
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma >= 0) {
    text = text.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = text.length - lastDot - 1;
    if (decimals === 3) text = text.replace(/\./g, ""); // 1.234 = milhar
  }

  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return sign * cents;
}

// ---------------------------------------------------------------------- datas --
export function parseDateToISO(raw: string, referenceYear?: number): string | null {
  if (!raw) return null;
  const text = String(raw).trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, Number(m[2]), Number(m[1]));
  }

  m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(text);
  if (m) {
    const year = referenceYear ?? new Date().getFullYear();
    return iso(year, Number(m[2]), Number(m[1]));
  }

  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ separador --
export function detectDelimiter(sample: string): string | null {
  const lines = sample.split(/\r?\n/).filter((line) => line.trim()).slice(0, 20);
  if (!lines.length) return null;

  const candidates = [";", ",", "\t", "|"];
  let best: { char: string; score: number } | null = null;

  for (const char of candidates) {
    const counts = lines.map((line) => line.split(char).length - 1).filter((n) => n > 0);
    if (counts.length < Math.max(2, Math.floor(lines.length * 0.6))) continue;
    const mode = modeOf(counts);
    if (mode < 1) continue;
    if (!best || mode > best.score) best = { char, score: mode };
  }

  return best?.char ?? null;
}

function modeOf(values: number[]): number {
  const tally = new Map<number, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Divide uma linha respeitando aspas duplas. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((cell) => cell.trim());
}

// ------------------------------------------------------------------ cabeçalho --
const DATE_KEYS = ["data", "date", "dt", "data lancamento", "data da compra", "data movimento", "data do movimento"];
const AMOUNT_KEYS = ["valor", "amount", "value", "quantia", "valor r$", "valor lancamento", "montante"];
const DESC_KEYS = ["lancamento", "descricao", "title", "historico", "memo", "estabelecimento", "detalhe", "description", "name"];

export const normalizeHeader = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function matchColumn(headers: string[], keys: string[]): number {
  for (const key of keys) {
    const index = headers.findIndex((header) => header === key);
    if (index >= 0) return index;
  }
  for (const key of keys) {
    const index = headers.findIndex((header) => header.includes(key));
    if (index >= 0) return index;
  }
  return -1;
}

// ----------------------------------------------------------------------- OFX --
export function parseOfx(text: string): RawRow[] {
  const rows: RawRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const pick = (tag: string) => new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, "i").exec(block)?.[1]?.trim() ?? "";
    const posted = pick("DTPOSTED");
    const amount = parseAmountToCents(pick("TRNAMT"));
    const memo = pick("MEMO") || pick("NAME");
    const fitId = pick("FITID");

    const date = posted ? parseDateToISO(posted.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) : null;
    if (!date || amount === null) continue;

    rows.push({ date, amountCents: amount, description: memo || "Lançamento", externalId: fitId || undefined });
  }

  return rows;
}

// ---------------------------------------------------------------------- main --
export function parseStatement(input: string | Uint8Array, referenceYear?: number): ParsedStatement {
  const { text, encoding } = typeof input === "string" ? { text: input, encoding: "utf-8" as const } : decodeBuffer(input);
  const warnings: string[] = [];

  if (/<OFX>/i.test(text) || /<STMTTRN>/i.test(text)) {
    const rows = parseOfx(text);
    if (!rows.length) warnings.push("OFX sem transações reconhecidas (STMTTRN)");
    return { format: "ofx", encoding, delimiter: null, headerIndex: null, columns: null, rows, warnings };
  }

  const delimiter = detectDelimiter(text);
  if (!delimiter) {
    return { format: "desconhecido", encoding, delimiter: null, headerIndex: null, columns: null, rows: [], warnings: ["não identifiquei o separador"] };
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let headerIndex = -1;
  let columns: ParsedStatement["columns"] = null;

  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const cells = splitLine(lines[i], delimiter).map(normalizeHeader);
    const date = matchColumn(cells, DATE_KEYS);
    const amount = matchColumn(cells, AMOUNT_KEYS);
    const description = matchColumn(cells, DESC_KEYS);
    if (date >= 0 && amount >= 0) {
      headerIndex = i;
      columns = { date, amount, description };
      break;
    }
  }

  if (!columns) {
    return { format: "delimiter", encoding, delimiter, headerIndex: null, columns: null, rows: [], warnings: ["cabeçalho com data/valor não encontrado"] };
  }

  const rows: RawRow[] = [];
  let rejected = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitLine(line, delimiter);
    if (cells.every((cell) => !cell)) continue;

    const date = parseDateToISO(cells[columns.date] ?? "", referenceYear);
    const amountCents = parseAmountToCents(cells[columns.amount] ?? "");
    if (!date || amountCents === null || amountCents === 0) {
      rejected += 1;
      continue;
    }

    const description = (columns.description >= 0 ? cells[columns.description] : "")?.replace(/\s+/g, " ").trim();
    rows.push({ date, amountCents, description: description || "Lançamento" });
  }

  if (rejected) warnings.push(`${rejected} linha(s) ignorada(s) por data/valor inválidos`);
  if (!rows.length) warnings.push("nenhuma linha válida após o cabeçalho");

  return { format: delimiter === "," ? "csv" : "delimiter", encoding, delimiter, headerIndex, columns, rows, warnings };
}

// ---------------------------------------------------------------- duplicidade --
export const normalizeDescription = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Chave estável para o mesmo arquivo: mesma linha → mesmo hash.
 * Duas linhas idênticas no mesmo arquivo recebem sufixos #1/#2, então
 * reimportar não duplica, mas duas compras iguais no mesmo dia entram.
 */
export function fingerprint(accountId: string, row: RawRow, occurrence = 1): string {
  const base = row.externalId
    ? `${accountId}|fitid|${row.externalId}`
    : `${accountId}|${row.date}|${row.amountCents}|${normalizeDescription(row.description)}|${occurrence}`;
  return createHash("sha1").update(base).digest("hex");
}

export function withFingerprints(accountId: string, rows: RawRow[]): Array<RawRow & { fingerprint: string }> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = row.externalId ?? `${row.date}|${row.amountCents}|${normalizeDescription(row.description)}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { ...row, fingerprint: fingerprint(accountId, row, occurrence) };
  });
}
