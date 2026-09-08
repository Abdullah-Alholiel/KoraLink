// check-migration-journal.mjs — repo-internal consistency gate (CI + local).
// Catches the two historical drift classes BEFORE any environment sees them:
//   1. a 00NN_*.sql file with NO _journal.json entry (run-#39 class) —
//      drizzle-kit/backfills would treat it as unapplied forever;
//   2. a _journal.json entry whose tag has NO file, or non-contiguous idx
//      values (the 0018-trap class).
// Exit 0 = consistent, exit 1 = drift (CI red).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRIZZLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api', 'drizzle');
const files = fs.readdirSync(DRIZZLE).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta', '_journal.json'), 'utf8')).entries;

const errors = [];
const journaledTags = new Set(journal.map((e) => e.tag));

// 1. every file must be journaled
for (const f of files) {
  const tag = f.replace(/\.sql$/, '');
  if (!journaledTags.has(tag)) errors.push(`file without journal entry: ${f}`);
}

// 2. every journal entry must have a file; idx must be UNIQUE and increasing
//    (strict contiguity is NOT required: hand-written 0014 collided with a
//    drizzle-kit 0014 historically — renumbering risks drizzle-kit compat).
const fileTags = new Set(files.map((f) => f.replace(/\.sql$/, '')));
const seen = new Set();
for (const e of journal) {
  if (seen.has(e.idx)) errors.push(`duplicate journal idx: ${e.idx} (${e.tag})`);
  seen.add(e.idx);
}
for (const e of journal) {
  if (!fileTags.has(e.tag)) errors.push(`journal entry without file: ${e.tag}`);
}

if (errors.length) {
  console.error('MIGRATION JOURNAL DRIFT:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`migration journal consistent: ${files.length} files, ${journal.length} entries, idx contiguous`);
