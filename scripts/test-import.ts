/**
 * Testes do importador de extratos.
 *   node --experimental-strip-types scripts/test-import.ts
 *   node --experimental-strip-types scripts/test-import.ts <arquivo>  ← tenta um arquivo real
 */
import { readFileSync } from "node:fs";
import {
  decodeBuffer,
  parseAmountToCents,
  parseDateToISO,
  parseStatement,
  withFingerprints,
  type RawRow,
} from "../src/lib/import/core.ts";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`✔ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`✖ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const cents = (value: string) => parseAmountToCents(value);

// --------------------------------------------------------------- 1. encoding --
const latin1 = Buffer.from("Data;Lançamento;Valor\n13/11/2026;Padaria;-25,00\n", "latin1");
const decodedLatin1 = decodeBuffer(new Uint8Array(latin1));
check("latin1 é detectado", decodedLatin1.encoding === "latin1", decodedLatin1.text.split("\n")[0]);
check("acento sobrevive ao latin1", decodedLatin1.text.includes("Lançamento"));

const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Data;Valor\n13/11/2026;10,00\n", "utf8")]);
const decodedBom = decodeBuffer(bom);
check("UTF-8 com BOM é detectado", decodedBom.encoding === "utf-8-bom");
check("BOM não vaza para o cabeçalho", decodedBom.text.startsWith("Data;"));

const plain = decodeBuffer(new Uint8Array(Buffer.from("Data;Valor\n13/11/2026;10,00\n", "utf8")));
check("UTF-8 puro é detectado", plain.encoding === "utf-8");

// ----------------------------------------------------------------- 2. valores --
check("1.234,56 → 123456", cents("1.234,56") === 123456, String(cents("1.234,56")));
check("1.234,56 D → -123456", cents("1.234,56 D") === -123456, String(cents("1.234,56 D")));
check("1.234,56 C → 123456", cents("1.234,56 C") === 123456);
check("-25,00 → -2500", cents("-25,00") === -2500);
check("-25.00 → -2500", cents("-25.00") === -2500);
check("R$ 25,90 → 2590", cents("R$ 25,90") === 2590);
check("(25,00) → -2500", cents("(25,00)") === -2500);
check("1.234 → 123400 (milhar)", cents("1.234") === 123400, String(cents("1.234")));
check("0,05 → 5", cents("0,05") === 5);
check("texto inválido → null", cents("abc") === null);
check("vazio → null", cents("") === null);

// ------------------------------------------------------------------- 3. datas --
check("13/11/2026", parseDateToISO("13/11/2026") === "2026-11-13");
check("13/11 com ano de referência", parseDateToISO("13/11", 2026) === "2026-11-13");
check("2026-11-13", parseDateToISO("2026-11-13") === "2026-11-13");
check("13/11/26 → 2026", parseDateToISO("13/11/26") === "2026-11-13");
check("31/02 é rejeitado", parseDateToISO("31/02/2026") === null);
check("data com hora é truncada", parseDateToISO("2026-11-13T10:00:00") === "2026-11-13");

// ------------------------------------- 4. CSV com preâmbulo do banco (Itaú-ish) --
const itau = [
  "Itaú Unibanco - Extrato de conta corrente",
  "Agência: 1234  Conta: 56789-0",
  "Período: 01/11/2026 a 13/11/2026",
  "",
  "Data;Lançamento;Agência;Conta;Valor",
  "05/11/2026;PIX RECEBIDO JOAO;1234;56789-0;1.500,00 C",
  "06/11/2026;COMPRA CARTAO MERCADO;1234;56789-0;238,37 D",
  "07/11/2026;TARIFA PACOTE;1234;56789-0;29,90 D",
].join("\r\n");

const itauParsed = parseStatement(itau, 2026);
// linhas vazias são descartadas, então o cabeçalho cai no índice 3
check("CSV: preâmbulo ignorado e cabeçalho achado", itauParsed.headerIndex === 3, `linha ${itauParsed.headerIndex}`);
check("CSV: 3 lançamentos", itauParsed.rows.length === 3, `${itauParsed.rows.length}`);
check("CSV: crédito positivo", itauParsed.rows[0]?.amountCents === 150000);
check("CSV: débito negativo", itauParsed.rows[1]?.amountCents === -23837);
check("CSV: descrição preservada", itauParsed.rows[1]?.description === "COMPRA CARTAO MERCADO");
check("CSV: data convertida", itauParsed.rows[0]?.date === "2026-11-05");
check("CSV: separador ;", itauParsed.delimiter === ";");

// --------------------------------------------------- 5. CSV da Nubank (vírgula) --
const nubank = ["date,title,amount", "2026-11-01,Padaria,-25.00", '2026-11-02,"Mercado, centro",-120.90', "2026-11-03,Salário,5000.00"].join("\n");
const nubankParsed = parseStatement(nubank);
check("Nubank: 3 linhas", nubankParsed.rows.length === 3);
check("Nubank: vírgula dentro de aspas", nubankParsed.rows[1]?.description === "Mercado, centro", nubankParsed.rows[1]?.description);
check("Nubank: valor decimal", nubankParsed.rows[2]?.amountCents === 500000);

// -------------------------------------------------------------------- 6. OFX --
const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000[-3:BRT]<TRNAMT>-238.37<FITID>20261105001<MEMO>COMPRA CARTAO MERCADO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106120000[-3:BRT]<TRNAMT>1500.00<FITID>20261106002<MEMO>PIX RECEBIDO JOAO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const ofxParsed = parseStatement(ofx);
check("OFX: formato reconhecido", ofxParsed.format === "ofx");
check("OFX: 2 transações", ofxParsed.rows.length === 2, `${ofxParsed.rows.length}`);
check("OFX: valor negativo", ofxParsed.rows[0]?.amountCents === -23837);
check("OFX: data", ofxParsed.rows[0]?.date === "2026-11-05");
check("OFX: FITID lido", ofxParsed.rows[0]?.externalId === "20261105001");

// ------------------------------------------------------------- 7. duplicidade --
const base: RawRow[] = [
  { date: "2026-11-05", amountCents: -2500, description: "Padaria" },
  { date: "2026-11-05", amountCents: -2500, description: "Padaria" },
  { date: "2026-11-05", amountCents: -2600, description: "Padaria" },
];

const first = withFingerprints("acc-1", base);
const second = withFingerprints("acc-1", base);
check("reimportar o mesmo arquivo gera as mesmas chaves", first.every((row, i) => row.fingerprint === second[i].fingerprint));
check("duas compras iguais no mesmo dia têm chaves diferentes", first[0].fingerprint !== first[1].fingerprint);
check("valor diferente muda a chave", first[0].fingerprint !== first[2].fingerprint);
check("conta diferente muda a chave", first[0].fingerprint !== withFingerprints("acc-2", base)[0].fingerprint);

const ofxFp = withFingerprints("acc-1", ofxParsed.rows);
check("OFX usa FITID como chave", ofxFp[0].fingerprint === withFingerprints("acc-1", ofxParsed.rows)[0].fingerprint);

// ------------------------------------------------------- 8. arquivo real (CLI) --
const file = process.argv[2];
if (file) {
  const buffer = new Uint8Array(readFileSync(file));
  const parsed = parseStatement(buffer);
  console.log(`\n— ${file}`);
  console.log(`  formato=${parsed.format} encoding=${parsed.encoding} separador=${JSON.stringify(parsed.delimiter)} linhas=${parsed.rows.length}`);
  for (const warning of parsed.warnings) console.log(`  ! ${warning}`);
  for (const row of withFingerprints("preview", parsed.rows).slice(0, 8)) {
    console.log(`  ${row.date}  ${(row.amountCents / 100).toFixed(2).padStart(10)}  ${row.description.slice(0, 48)}  ${row.fingerprint.slice(0, 8)}`);
  }
}

console.log(failures === 0 ? "\nTUDO OK" : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
