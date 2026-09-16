#!/usr/bin/env node
// fk-index-report.mjs — FK coverage audit: every FK column must lead an index.
// Postgres does NOT auto-index the referencing side of a FK; deletes/updates on the
// referenced PK full-scan every referencing table without a leading-column index.
// Read-only. Reads DATABASE_URL from apps/api/.env itself (never source it) or
// MIGRATE_DATABASE_URL override (same contract as scripts/migrate-vps.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pgPkg from 'postgres';

const postgres = pgPkg.default ?? pgPkg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl =
  process.env.MIGRATE_DATABASE_URL ||
  (() => {
    const envText = fs.readFileSync(path.join(ROOT, 'apps/api/.env'), 'utf8');
    return envText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('DATABASE_URL=') && !l.trim().startsWith('#'))
      ?.slice('DATABASE_URL='.length)
      .replace(/^[\"']|[\"']$/g, '');
  })();
if (!dbUrl) {
  console.error('fk-index-report: DATABASE_URL not found in apps/api/.env');
  process.exit(5);
}

const sql = postgres(dbUrl, { max: 1, connect_timeout: 15 });

try {
  const fks = await sql`
    SELECT tc.table_name,
           kcu.column_name,
           ccu.table_name AS ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'`;

  const idx = await sql`
    SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;

  const led = ({ table, column }) =>
    idx.some(
      (i) =>
        i.tablename === table &&
        new RegExp(String.raw`\(${column}[,)]`).test(i.indexdef.replace(/\s+/g, ' ')),
    );

  const unLed = [];
  for (const fk of fks) {
    const entry = { table: fk.table_name, column: fk.column_name, ref: fk.ref_table };
    if (!led(entry)) unLed.push(entry);
  }

  console.log(`FK columns: ${fks.length} | indexes: ${idx.length}`);
  if (unLed.length === 0) {
    console.log('FK COVERAGE: OK — every FK column leads at least one index');
  } else {
    console.log(`FK COVERAGE: ${unLed.length} UN-LED FK column(s):`);
    for (const u of unLed.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column)))
      console.log(`  - ${u.table}.${u.column} -> ${u.ref}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
