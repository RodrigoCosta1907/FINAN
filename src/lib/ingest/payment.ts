/**
 * Meio de pagamento na mensagem do Telegram.
 *
 * "25 padaria credito nubank"  → crédito, cartão pelo apelido
 * "25 padaria credito 8481"    → crédito, cartão pelo final
 * "25 padaria"                 → sem meio de pagamento (débito na conta, como antes)
 *
 * Só tratamos um número de 4 dígitos como final de cartão quando existe OUTRO
 * número na mensagem — senão "1500 salário" perderia o valor.
 */

export type PaymentMethod = "credit" | "debit" | "pix" | "cash" | null;

const CREDIT = /\b(?:no\s+)?(?:cr[eé]dito|credito|cart[ãa]o|cartao)\b/gi;
const DEBIT = /\b(?:no\s+)?(?:d[eé]bito|debito)\b/gi;
const PIX = /\b(?:no\s+)?pix\b/gi;
const CASH = /\b(?:em\s+)?(?:dinheiro|esp[eé]cie|cash)\b/gi;

export type PaymentInfo = {
  method: PaymentMethod;
  cleaned: string;
  cardEnd: string | null;
  bankHint: string | null;
};

const BANKS = ["nubank", "itau", "itaú", "picpay", "mercado pago", "mercadopago", "inter", "bradesco", "santander", "caixa", "c6", "visa", "master"];

export function detectPayment(text: string): PaymentInfo {
  const original = text.trim();
  let method: PaymentMethod = null;
  let cleaned = original;

  // regex com /g é stateful: zera o lastIndex antes de cada teste
  const hits = (pattern: RegExp, value: string) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  };

  if (hits(CREDIT, cleaned)) {
    method = "credit";
    cleaned = cleaned.replace(CREDIT, " ");
  } else if (hits(DEBIT, cleaned)) {
    method = "debit";
    cleaned = cleaned.replace(DEBIT, " ");
  } else if (hits(PIX, cleaned)) {
    method = "pix";
    cleaned = cleaned.replace(PIX, " ");
  } else if (hits(CASH, cleaned)) {
    method = "cash";
    cleaned = cleaned.replace(CASH, " ");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  let bankHint: string | null = null;
  const lower = cleaned.toLowerCase();
  for (const bank of BANKS) {
    if (lower.includes(bank)) {
      bankHint = bank.replace("itaú", "itau").replace("mercadopago", "mercado pago");
      // o nome do banco é dica, não faz parte da descrição
      cleaned = cleaned
        .replace(new RegExp(`\\b${bank.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ")
        .replace(/\s+/g, " ")
        .trim();
      break;
    }
  }

  let cardEnd: string | null = null;
  if (method === "credit") {
    const tokens = cleaned.split(/\s+/);
    const numeric = tokens.filter((token) => /[\d]/.test(token));
    const fourDigit = tokens.filter((token) => /^\d{4}$/.test(token));
    // 8481 só é cartão se houver outro número (o valor) na mensagem
    if (fourDigit.length >= 1 && numeric.length >= 2) {
      cardEnd = fourDigit[fourDigit.length - 1];
      let removed = false;
      cleaned = tokens
        .filter((token) => {
          if (!removed && token === cardEnd) {
            removed = true;
            return false;
          }
          return true;
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return { method, cleaned, cardEnd, bankHint };
}
