// Testa o parser do Telegram sem framework: node --experimental-strip-types scripts/test-parse.ts
import { parseLine, parseMessage } from "../src/lib/ingest/parse.ts";

const TODAY = "2026-11-13";
let failures = 0;
let checks = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`✖ ${label}\n    recebido: ${JSON.stringify(actual)}\n    esperado: ${JSON.stringify(expected)}`);
  }
}

function entry(line: string) {
  const r = parseLine(line, TODAY);
  if ("error" in r) return { error: r.error };
  return {
    cents: r.amountCents,
    kind: r.kind,
    desc: r.description,
    date: r.date,
    cat: r.categoryHint,
  };
}

expect("25 casa de bolos", entry("25 casa de bolos"), {
  cents: 2500, kind: "expense", desc: "Casa de bolos", date: TODAY, cat: "Alimentação",
});

expect("20,47 eiscreme", entry("20,47 eiscreme"), {
  cents: 2047, kind: "expense", desc: "Eiscreme", date: TODAY, cat: "Alimentação",
});

expect("238,37 cantina 11/11", entry("238,37 cantina 11/11"), {
  cents: 23837, kind: "expense", desc: "Cantina", date: "2026-11-11", cat: "Alimentação",
});

expect("+1500 salário", entry("+1500 salário"), {
  cents: 150000, kind: "income", desc: "Salário", date: TODAY, cat: "Salário",
});

expect("atacadão 69,28", entry("atacadão 69,28"), {
  cents: 6928, kind: "expense", desc: "Atacadão", date: TODAY, cat: "Alimentação",
});

expect("-12,50 café ontem", entry("-12,50 café ontem"), {
  cents: 1250, kind: "expense", desc: "Café", date: "2026-11-12", cat: "Alimentação",
});

expect("R$ 1.234,56 aluguel 05/11/2026", entry("R$ 1.234,56 aluguel 05/11/2026"), {
  cents: 123456, kind: "expense", desc: "Aluguel", date: "2026-11-05", cat: "Moradia",
});

expect("netflix 39,90", entry("netflix 39,90"), {
  cents: 3990, kind: "expense", desc: "Netflix", date: TODAY, cat: "Assinaturas",
});

expect("uber 25.90", entry("uber 25.90"), {
  cents: 2590, kind: "expense", desc: "Uber", date: TODAY, cat: "Transporte",
});

expect("500 sozinho", entry("500"), {
  cents: 50000, kind: "expense", desc: "Lançamento", date: TODAY, cat: "Outros",
});

expect("sem valor falha", entry("comprei pão"), { error: "não encontrei o valor" });
expect("zero falha", entry("0 café"), { error: "não encontrei o valor" });
expect("data inválida falha", entry("50 cantina 31/02"), { error: "data inválida" });

const multi = parseMessage("25 casa de bolos\n69,28 atacadão\n\n43 pizza 7/11", TODAY);
expect("mensagem com 3 linhas", multi.entries.length, 3);
expect("linha 3 data", multi.entries[2]?.date, "2026-11-07");
expect("nenhuma falha", multi.failures.length, 0);

const parcial = parseMessage("25 padaria\nnao sei o valor", TODAY);
expect("uma ok + uma falha", [parcial.entries.length, parcial.failures.length], [1, 1]);

console.log(failures === 0 ? `\nTUDO OK — ${checks} verificações` : `\nFALHOU — ${failures} de ${checks}`);
process.exit(failures === 0 ? 0 : 1);
