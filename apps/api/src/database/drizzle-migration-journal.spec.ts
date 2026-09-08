import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P1-33 class tripwire (run #39): the drizzle migration journal must list EVERY
 * numbered migration file in drizzle/, and every journal entry must have its
 * file on disk. Run #39 found 0034/0035 committed to git but NOT journaled —
 * `readMigrationFiles` (drizzle-orm/migrator.js) iterates ONLY journal entries,
 * so fresh environments silently skipped both migrations (waitlist table +
 * skill_level drop missing → schema drift vs schema.ts and runtime 500s).
 *
 * The live DB was unaffected (bookkeeping rows exist); this spec protects
 * FRESH environments (CI, new clones, restored DBs) — the P1-33 "orphan
 * migration" failure mode, caught at test time instead of boot time.
 */

const DRIZZLE_DIR = join(__dirname, '..', '..', 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

/** Files that are not migrations — helpers applied out-of-band by convention. */
const NON_MIGRATION_FILES = new Set(['gist_indexes.sql']);

/**
 * Formerly the run #23 "known orphan" (deliberately unjournaed as a historical
 * record). Run #46's CI/CD cycle formally adopted it: a meta/_journal.json
 * entry now exists (idx 39) and all three environments (VPS, Neon, CI scratch)
 * have it hash-journaled. The KNOWN_ORPHANS exemption is therefore REMOVED —
 * a new unjournaled file still fails this suite, with no exceptions left.
 */
const KNOWN_ORPHANS = new Set<string>([]);

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

describe('drizzle migration journal parity (run #39 tripwire)', () => {
  let journal: { entries: JournalEntry[] };
  let sqlFiles: string[];

  beforeAll(() => {
    journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
    sqlFiles = readdirSync(DRIZZLE_DIR)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => !NON_MIGRATION_FILES.has(f))
      .filter((f) => !KNOWN_ORPHANS.has(f))
      .sort();
  });

  it('every numbered migration file has a journal entry', () => {
    const tags = new Set(journal.entries.map((e) => e.tag));
    const missing = sqlFiles.filter((f) => !tags.has(f.replace(/\.sql$/, '')));
    // Failure message tells the fixer exactly what to append (run #39 bug).
    expect(
      missing.length === 0
        ? []
        : `migration files on disk but NOT journaled in meta/_journal.json: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every journal entry has its .sql file on disk', () => {
    const files = new Set(sqlFiles.map((f) => f.replace(/\.sql$/, '')));
    const missing = journal.entries.filter((e) => !files.has(e.tag));
    expect(
      missing.length === 0
        ? []
        : `journal entries whose .sql file is missing on disk: ${missing.map((e) => e.tag).join(', ')}`,
    ).toEqual([]);
  });

  it('journal entries are contiguous, ordered by idx, with strictly increasing when', () => {
    const entries = journal.entries;
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(typeof e.when).toBe('number');
      // Any numeric version passes (a drizzle-kit bump to '8' must not fail the
      // tripwire spuriously) — the CURRENT entries are all version '7'.
      expect(e.version).toMatch(/^\d+$/);
      if (i > 0) expect(e.when).toBeGreaterThan(entries[i - 1].when);
    });
    expect(entries[entries.length - 1].version).toBe('7');
  });

  it('fresh-DB replay reaches the documented P1-17/P0-10 schema state (static SQL pins)', () => {
    // 0034 must create the waitlist table AND the DEFERRABLE (match_id, position)
    // constraint — waitlist.service resequences positions inside one tx and
    // depends on the deferred uniqueness (see waitlist.service.ts header).
    const m0034 = readFileSync(join(DRIZZLE_DIR, '0034_waitlist_capacity_standard.sql'), 'utf8');
    expect(m0034).toMatch(/CREATE TABLE IF NOT EXISTS match_waitlist/);
    expect(m0034).toMatch(/match_waitlist_match_pos_unique/);
    expect(m0034).toMatch(/DEFERRABLE INITIALLY DEFERRED/);
    expect(m0034).toMatch(/IF NOT EXISTS/); // idempotent replay requirement

    // 0035 must drop skill_level everywhere (P0-10 incident state).
    const m0035 = readFileSync(join(DRIZZLE_DIR, '0035_drop_skill_level.sql'), 'utf8');
    expect(m0035).toMatch(/skill_level/);
    expect(m0035).toMatch(/DROP COLUMN/i);
  });
});
