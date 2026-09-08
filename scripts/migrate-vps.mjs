#!/usr/bin/env node
// migrate-vps.mjs — VPS migration applier (drizzle-kit is UNAVAILABLE on this VPS).
// Contract: docs/plans/environment-segregation/03-program-design.md (Contract 2)
// - Reads DATABASE_URL from apps/api/.env itself (never sourced into the shell).
// - Applies apps/api/drizzle/<NNNN_*.sql> in lexicographic order, skipping anything whose
//   sha256 is already journaled in drizzle.__drizzle_migrations (runbook convention).
// - SAFETY: a pending file that sorts BEFORE the highest journaled 4-digit index is a
//   journal GAP (the 0018-trap class) — it is NOT applied; the script exits 5 for a human.
// - Idempotent: a second run with no new files performs zero writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pgPkg from 'postgres';

const postgres = pgPkg.default ?? pgPkg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, 'apps/api/.env');
const DRIZZLE_DIR = path.join(ROOT, 'apps/api/drizzle');

// ── load DATABASE_URL ────────────────────────────────────────────────────────
const envText = fs.readFileSync(ENV_FILE, 'utf8');
const dbUrl = envText.split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('DATABASE_URL=') && !l.trim().startsWith('#'))
  ?.slice('DATABASE_URL='.length)
  .replace(/^["']|["']$/g, '');
if (!dbUrl) {
  console.error('migrate-vps: DATABASE_URL not found in apps/api/.env');
  process.exit(5);
}

const sql = postgres(dbUrl, { max: 1, connect_timeout: 15 });
const DUP_CODES = new Set(['42P07', '42710', '42701', '42P06', '23505']);

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function journalTable() {
  // Prefer the drizzle schema table (runbook convention); fall back to public/create.
  const rows = await sql`
    SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations'`;
  if (rows.some((r) => r.table_schema === 'drizzle')) return { fq: 'drizzle.__drizzle_migrations' };
  if (rows.length > 0) return { fq: `${rows[0].table_schema}.${rows[0].table_name}` };
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
  return { fq: 'drizzle.__drizzle_migrations' };
}

try {
  const files = fs.readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f)) // gist_indexes.sql and non-migration SQL excluded
    .sort(); // lexicographic === numeric for zero-padded 4-digit prefixes

  const t = await journalTable();
  const journaled = new Set(
    (await sql.unsafe(`SELECT hash FROM ${t.fq}`)).map((r) => r.hash),
  );

  // Highest journaled migration index (for gap detection)
  const fileIndex = (f) => parseInt(f.slice(0, 4), 10);
  const maxKnown = files.reduce((m, f) => (journaled.has(sha256(fs.readFileSync(path.join(DRIZZLE_DIR, f), 'utf8'))) ? Math.max(m, fileIndex(f)) : m), -1);

  const pending = files.filter((f) => !journaled.has(sha256(fs.readFileSync(path.join(DRIZZLE_DIR, f), 'utf8'))));
  const gap = pending.filter((f) => fileIndex(f) < maxKnown && maxKnown >= 0);
  if (gap.length > 0) {
    console.error(`migrate-vps: JOURNAL GAP — pending files older than max applied (${maxKnown}): ${gap.join(', ')}`);
    console.error('migrate-vps: refusing to guess; reconcile the journal by hand (0018-trap class).');
    process.exit(5);
  }

  let applied = 0;
  for (const f of pending) {
    const content = fs.readFileSync(path.join(DRIZZLE_DIR, f), 'utf8');
    const hash = sha256(content);
    const statements = content.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    let ok = true;
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        if (DUP_CODES.has(e.code) || /already exists/i.test(e.message ?? '')) {
          console.log(`    = ${f}: statement tolerated (already exists)`);
          continue;
        }
        console.error(`migrate-vps: FAILED in ${f}:\n---\n${stmt.slice(0, 400)}\n---\n${e.message}`);
        ok = false;
        break;
      }
    }
    if (!ok) process.exit(5);
    await sql.unsafe(`INSERT INTO ${t.fq} (hash, created_at) VALUES ($1, $2)`, [hash, Date.now()]);
    applied += 1;
    console.log(`  applied ${f}`);
  }
  console.log(`migrate-vps: ${applied} applied, ${files.length - pending.length} skipped (journal current)`);
  process.exit(0);
} finally {
  await sql.end({ timeout: 5 });
}
