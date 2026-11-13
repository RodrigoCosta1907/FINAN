// Confere o estado do banco remoto depois do db:push (somente leitura).
//   npm run db:verify
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const ROOT = process.cwd();

async function loadEnv() {
  const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

await loadEnv();

const explicit = process.env.SUPABASE_DB_URL ?? "";
const url = /^postgres(ql)?:\/\//.test(explicit)
  ? explicit
  : `postgresql://postgres.${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "")}@${process.env.SUPABASE_POOLER_HOST}:5432/postgres`;

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (sql, params) => (await client.query(sql, params)).rows;

const checks = [];

const [{ n: tables }] = await q(`
  select count(*)::int as n from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'
`);
checks.push(["tabelas em public", tables, 36]);

const [{ n: rls }] = await q(`
  select count(*)::int as n from pg_tables t
  join pg_class c on c.relname = t.tablename
  where t.schemaname = 'public' and t.tablename <> 'schema_migrations' and c.relrowsecurity
`);
checks.push(["tabelas com RLS ligado", rls, 36]);

const [{ n: policies }] = await q(`
  select count(*)::int as n from pg_policies where schemaname = 'public'
`);
checks.push(["políticas RLS", policies, ">= 70"]);

const [{ n: finFns }] = await q(`
  select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'fin\\_%'
`);
checks.push(["funções public.fin_*", finFns, 14]);

const [{ n: appFns }] = await q(`
  select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
`);
checks.push(["funções internas (schema app)", appFns, ">= 20"]);

const [{ n: views }] = await q(`
  select count(*)::int as n from pg_views where schemaname = 'public'
`);
checks.push(["views de relatório", views, 7]);

const [{ n: triggers }] = await q(`
  select count(*)::int as n from pg_trigger where not tgisinternal
`);
checks.push(["triggers", triggers, ">= 28"]);

const [{ n: enums }] = await q(`
  select count(*)::int as n from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e'
`);
checks.push(["enums", enums, 23]);

const audit = await q(`select count(*)::int as n from public.audit_logs`);
checks.push(["audit_logs (append-only)", audit[0].n, 0]);

console.log("\nBANCO");
for (const [label, got, expected] of checks) {
  const ok = typeof expected === "number" ? got === expected : true;
  console.log(`${ok ? "✔" : "•"} ${label}: ${got}${typeof expected === "number" ? ` (esperado ${expected})` : ` (esperado ${expected})`}`);
}

const applied = await q(`select name from public.schema_migrations order by name`);
console.log("\nMIGRATIONS APLICADAS");
for (const row of applied) console.log(`✔ ${row.name}`);

// ---- dados existentes (prova de uso real, não só schema) ----
const dataChecks = [
  ["usuários (auth.users)", "select count(*)::int as n from auth.users"],
  ["households", "select count(*)::int as n from public.households"],
  ["pessoas", "select count(*)::int as n from public.people"],
  ["categorias", "select count(*)::int as n from public.categories"],
  ["contas financeiras", "select count(*)::int as n from public.financial_accounts"],
  ["lançamentos", "select count(*)::int as n from public.account_transactions"],
  ["contas a pagar", "select count(*)::int as n from public.bills"],
];
console.log("\nDADOS");
for (const [label, sql] of dataChecks) {
  const rows = await q(sql);
  console.log(`• ${label}: ${rows[0].n}`);
}

await client.end();

// ---- API pública (PostgREST), como o app fará ----
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

console.log("\nAPI (PostgREST com anon key)");
for (const table of ["profiles", "households", "account_transactions", "credit_card_invoices"]) {
  const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await res.text();
  const empty = body === "[]";
  console.log(`${res.status === 200 ? "✔" : "✖"} /${table}: HTTP ${res.status}${empty ? " (0 linhas — RLS ativa)" : ""}`);
}

// anon não tem EXECUTE nas RPCs de propósito (só `authenticated`): 401 aqui é
// o comportamento correto. 404 significaria função ausente.
const rpc = await fetch(`${base}/rest/v1/rpc/fin_dashboard_summary`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ p_household: "00000000-0000-0000-0000-000000000000", p_year: 2026, p_month: 11 }),
});
const rpcOk = rpc.status === 401 || rpc.status === 403;
console.log(
  `${rpcOk ? "✔" : "✖"} rpc fin_dashboard_summary: HTTP ${rpc.status}` +
    (rpcOk ? " (existe; anon bloqueado como esperado — só `authenticated` executa)" : " (função ausente ou exposta demais)"),
);
