// Harness de verificação local do schema.
// Sobe um PostgreSQL descartável (embedded-postgres), aplica as migrations em
// ordem e roda os testes SQL de supabase/tests. Não faz parte do app.
//
//   node scripts/db-check.mjs
//
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { readdir, readFile, rm } from "node:fs/promises";
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, '.tmp-db');
const PORT = 54329;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    autoRehydrateSymlinks: true,
  });

  let client;
  try {
    // cluster sempre limpo: uma execução interrompida não pode envenenar a próxima
    await rm(DB_DIR, { recursive: true, force: true });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('financas');

    client = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: 'postgres',
      password: 'postgres',
      database: 'financas',
    });
    await client.connect();
  } catch (err) {
    await pg.stop().catch(() => {});
    throw err;
  }

  const fail = (label, err) => {
    console.error(`\n✖ ${label}\n${err.message}`);
    if (err.position) console.error(`  posição ${err.position}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    process.exitCode = 1;
  };

  try {
    const bootstrap = await readFile(path.join(ROOT, 'supabase/tests/00_bootstrap.sql'), 'utf8');
    await client.query(bootstrap);
    console.log('✔ bootstrap (auth stub)');

    const dir = path.join(ROOT, 'supabase/migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query(sql);
        console.log(`✔ ${file}`);
      } catch (err) {
        fail(file, err);
        throw err;
      }
    }

    const testsDir = path.join(ROOT, 'supabase/tests');
    const tests = (await readdir(testsDir)).filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('00_')).sort();
    for (const file of tests) {
      const sql = await readFile(path.join(testsDir, file), 'utf8');
      try {
        const res = await client.query(sql);
        const out = Array.isArray(res) ? res.map((r) => r.rows) : res.rows;
        console.log(`✔ test ${file}`);
        console.log(JSON.stringify(out, null, 2));
      } catch (err) {
        fail(file, err);
        throw err;
      }
    }
  } finally {
    await client.end().catch(() => {});
    await pg.stop().catch(() => {});
  }

  if (process.exitCode) {
    console.error('\nFALHOU');
  } else {
    console.log('\nTUDO OK');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
