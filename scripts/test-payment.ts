/**
 * Testes da detecção de meio de pagamento no Telegram.
 *   node --experimental-strip-types scripts/test-payment.ts
 */
import { detectPayment } from "../src/lib/ingest/payment.ts";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) console.log(`✔ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`✖ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let info = detectPayment("25 padaria credito");
check("credito simples detectado", info.method === "credit");
check("texto limpo sem a palavra crédito", info.cleaned === "25 padaria", info.cleaned);
check("sem final informado", info.cardEnd === null);

info = detectPayment("25 padaria credito 8481");
check("final de 4 dígitos vira cartão", info.cardEnd === "8481", String(info.cardEnd));
check("final sai do texto", info.cleaned === "25 padaria", info.cleaned);

info = detectPayment("238,37 cantina credito visa ontem");
check("bandeira como dica", info.bankHint === "visa", String(info.bankHint));
check("data relativa preservada", info.cleaned === "238,37 cantina ontem", info.cleaned);

info = detectPayment("25 padaria credito nubank");
check("banco como dica", info.bankHint === "nubank", String(info.bankHint));

info = detectPayment("1500 salario");
check("sem crédito não muda nada", info.method === null && info.cleaned === "1500 salario");
check("valor de 4 dígitos não vira cartão", info.cardEnd === null, String(info.cardEnd));

info = detectPayment("1234 padaria");
check("4 dígitos sozinho é valor", info.cardEnd === null && info.cleaned === "1234 padaria");

info = detectPayment("-12,50 café ontem");
check("débito comum intacto", info.method === null && info.cleaned === "-12,50 café ontem");

info = detectPayment("100 mercado pix");
check("pix detectado", info.method === "pix" && info.cleaned === "100 mercado");

info = detectPayment("50 uber debito");
check("débito no cartão detectado", info.method === "debit", String(info.method));

info = detectPayment("25 padaria no cartão");
check("'no cartão' é crédito", info.method === "credit" && info.cleaned === "25 padaria", info.cleaned);

info = detectPayment("25 padaria credito 8481 8481");
check("dois finais iguais: usa um e mantém o outro", info.cleaned === "25 padaria 8481", info.cleaned);

console.log(failures === 0 ? "\nTUDO OK" : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
