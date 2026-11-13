/**
 * Parser de mensagens do Telegram no formato livre.
 * Sem dependências externas para poder rodar em teste com `node --experimental-strip-types`.
 *
 * Aceita (uma por linha):
 *   25 casa de bolos
 *   20,47 escrete
 *   238,37 cantina 11/11
 *   atacadão 69,28
 *   +1500 salário
 *   -12,50 café ontem
 *   R$ 1.234,56 aluguel 05/11/2026
 */

export type ParsedEntry = {
  amountCents: number;
  kind: "income" | "expense";
  description: string;
  date: string; // YYYY-MM-DD
  categoryHint: string | null;
};

export type ParseFailure = { raw: string; error: string };

export type ParseResult = { entries: ParsedEntry[]; failures: ParseFailure[] };

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const CATEGORY_KEYWORDS: Array<{ name: string; words: string[] }> = [
  { name: "Alimentação", words: ["padaria", "pao", "pão", "bolos", "bolo", "cantina", "pizza", "restaurante", "lanche", "ifood", "delivery", "acai", "açaí", "escreme", "eiscreme", "sorvete", "gelateria", "cafe", "café", "mercado", "atacadao", "atacadão", "supermercado", "padoca", "hamburguer", "hambúrguer", "bar", "doceria", "confeitaria", "pastel"] },
  { name: "Transporte", words: ["uber", "99", "taxi", "táxi", "onibus", "ônibus", "metro", "metrô", "gasolina", "posto", "combustivel", "combustível", "estacionamento", "pedagio", "pedágio"] },
  { name: "Saúde", words: ["farmacia", "farmácia", "drogaria", "medico", "médico", "consulta", "exame", "dentista", "academia", "pilates"] },
  { name: "Moradia", words: ["aluguel", "condominio", "condomínio", "energia", "luz", "agua", "água", "internet", "gas", "gás", "faxina"] },
  { name: "Assinaturas", words: ["netflix", "spotify", "assinatura", "streaming", "disney", "youtube", "icloud", "chatgpt"] },
  { name: "Lazer", words: ["cinema", "show", "jogo", "ingresso", "viagem", "hotel", "praia"] },
  { name: "Vestuário", words: ["roupa", "camisa", "camiseta", "tenis", "tênis", "sapato", "calca", "calça", "loja"] },
  { name: "Educação", words: ["curso", "livro", "escola", "faculdade", "mensalidade"] },
  { name: "Saúde", words: ["remedio", "remédio"] },
];

const INCOME_WORDS = ["salario", "salário", "recebi", "entrou", "freelance", "reembolso", "estorno", "vendi", "pix recebido"];

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // dia inexistente (ex.: 31/02)
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Converte "1.234,56", "69,28", "1500", "20.47" em centavos. */
export function parseAmount(token: string): number | null {
  let t = token.replace(/r\$/i, "").replace(/\s/g, "").trim();
  if (!t) return null;

  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // 1.500 = mil e quinhentos
  }

  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const value = Number(t);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function suggestCategory(description: string, kind: "income" | "expense"): string | null {
  const text = description.toLowerCase();
  if (kind === "income") {
    if (/salario|salário/.test(text)) return "Salário";
    if (/freelance|freela/.test(text)) return "Freelance";
    if (/reembolso|estorno/.test(text)) return "Reembolso";
    return "Outras receitas";
  }
  for (const group of CATEGORY_KEYWORDS) {
    if (group.words.some((word) => text.includes(word))) return group.name;
  }
  return "Outros";
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseLine(raw: string, today: string): ParsedEntry | ParseFailure {
  const original = raw.trim();
  if (!original) return { raw, error: "linha vazia" };

  let line = original.replace(/\s+/g, " ");

  // "R$" solto não faz parte da descrição
  line = line.replace(/^r\$\s*/i, "").trim();

  // sinal explícito
  let sign: "+" | "-" | null = null;
  if (/^\+/.test(line)) {
    sign = "+";
    line = line.slice(1).trim();
  } else if (/^-/.test(line)) {
    sign = "-";
    line = line.slice(1).trim();
  }

  // data (dd/mm ou dd/mm/aaaa)
  let date = today;
  const dateMatch = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(line);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    let year = dateMatch[3] ? Number(dateMatch[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    const parsed = isoDate(year, month, day);
    if (!parsed) return { raw: original, error: "data inválida" };
    date = parsed;
    line = line.replace(dateMatch[0], " ").trim();
  } else if (/\bontem\b/i.test(line)) {
    date = shiftDays(today, -1);
    line = line.replace(/\bontem\b/i, " ").trim();
  } else if (/\bhoje\b/i.test(line)) {
    line = line.replace(/\bhoje\b/i, " ").trim();
  }

  // valor: primeiro token que parece dinheiro
  const tokens = line.split(" ").filter(Boolean);
  let amountCents: number | null = null;
  const kept: string[] = [];
  for (const token of tokens) {
    if (amountCents === null) {
      const value = parseAmount(token);
      if (value !== null) {
        amountCents = value;
        continue;
      }
    }
    kept.push(token);
  }

  if (amountCents === null) {
    return { raw: original, error: "não encontrei o valor" };
  }

  let description = kept.join(" ").replace(/\s+/g, " ").trim();
  description = description.replace(/^[-–—,;:]+|[-–—,;:]+$/g, "").trim();
  if (!description) description = "Lançamento";

  const lower = stripAccents(description.toLowerCase());
  const kind: "income" | "expense" =
    sign === "+" || (sign === null && INCOME_WORDS.some((w) => lower.includes(stripAccents(w))))
      ? "income"
      : "expense";

  const spaced = description.charAt(0).toUpperCase() + description.slice(1);

  return {
    amountCents,
    kind,
    description: spaced,
    date,
    categoryHint: suggestCategory(description, kind),
  };
}

export function parseMessage(text: string, today: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const failures: ParseFailure[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const result = parseLine(rawLine, today);
    if ("error" in result) failures.push(result);
    else entries.push(result);
  }

  return { entries, failures };
}

export function formatEntry(entry: ParsedEntry, brl: (cents: number) => string): string {
  const [year, month, day] = entry.date.split("-");
  const when = `${day}/${month}/${year?.slice(2)}`;
  const sign = entry.kind === "income" ? "+" : "−";
  return `${sign} ${brl(entry.amountCents)} · ${entry.description} · ${entry.categoryHint ?? "sem categoria"} · ${when}`;
}

export const monthLabels = MONTHS_PT;
