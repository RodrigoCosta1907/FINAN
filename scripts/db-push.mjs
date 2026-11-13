// Aplica as migrations de supabase/migrations no banco do Supabase (remoto).
// Lê SUPABASE_DB_URL de .env.local (nunca do chat, nunca commitado).
//
//   npm run db:push            -> aplica o que falta
//   npm run db:push -- --dry   -> só lista o que seria aplicado
//
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const DRY = process.argv.includes("--dry");

async function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  let raw = "";
  try {
    raw = await readFile(envPath, "utf8");
  } catch {
    throw new Error("Crie o arquivo .env.local (veja .env.example) antes de rodar.");
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key!]) process.env[key!] = value!.replace(/^["']|["']$/g, "");
  }
}

await loadEnv();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  throw new Error(
    "SUPABASE_DB_URL ausente no .env.local. Use a connection string do projeto " +
      "(Dashboard → Project Settings → Database → Connection string → Session pooler).",
  );
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("✔ conectado ao banco remoto");

  await client.query(`
    create table if not exists public.schema_migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    );
  `);

  const { rows } = await client.query("select name from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (!pending.length) {
    console.log("nada a aplicar — banco já está na última migration");
    process.exit(0);
  }

  console.log(`${pending.length} migration(s) pendente(s): ${pending.join(", ")}`);
  if (DRY) process.exit(0);

  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS, file), "utf8");
    const started = Date.now();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`✔ ${file} (${Date.now() - started} ms)`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`✖ ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }

  const after = await client.query("select count(*)::int as n from public.schema_migrations");
  console.log(`migrations aplicadas no banco: ${after.rows[0].n}`);
} finally {
  await client.end().catch(() => {});
}
