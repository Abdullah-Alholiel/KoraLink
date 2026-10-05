import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-88 guard — REBUILT state (run #103).
 *
 * History: the snapshot chain was TORN (snapshots existed for 0000–0026 and an
 * orphaned 0029 only; 0027/0028/0030–0045 were hand-written without snapshots).
 * Run #103 rebuilt the full chain: every journal entry now has a snapshot, the
 * post-0026 snapshots are prevId-linked starting from 0026's id, and the anchor
 * (the LAST journal entry's snapshot — the one `drizzle-kit generate` diffs
 * against) is a DECLARATION-serialization of schema.ts, so `generate` emits
 * "No schema changes" against the current schema (verified in the run #103
 * rehearsal; live-probed "nothing to migrate 😴").
 *
 * These tests pin the HEALED state so any change is a loud, deliberate act:
 *  - a NEW hand-written migration without a snapshot flips red → generate a
 *    snapshot for it (see the recipe below) or consciously extend the pin;
 *  - a broken prevId link (rebase accident, hand edit) flips red;
 *  - the anchor snapshot drifting from schema.ts is caught by `generate`
 *    in CI, not here (this test only checks structural integrity).
 *
 * Snapshot naming: drizzle-kit <0.30 wrote `meta/<NNNN>_snapshot.json`;
 * v0.30.6 writes `meta/<full-tag>_snapshot.json`. The repo legitimately has
 * BOTH styles (0000–0026 old, 0027+ new) — resolution is full-tag first,
 * numeric-prefix fallback.
 *
 * Rebuild recipe (works on this VPS — drizzle-kit 0.30.6 runs via a node_modules
 * mirror: drizzle-kit itself is root-hoisted but drizzle-orm/postgres only exist
 * under apps/api/node_modules, so symlink both next to a config in /tmp and run
 * `node --preserve-symlinks --preserve-symlinks-main .../drizzle-kit/bin.cjs`):
 *  1. scratch PG with postgis (the schema uses geography columns),
 *  2. apply migrations in JOURNAL ARRAY order — the un-journaled orphan file
 *     0014_admin_notification_verbs.sql must be applied right before
 *     0018_absent_shotgun (its live-history position; 'no_show_marked' must
 *     exist for 0018's BEFORE clause),
 *  3. per entry after 0026: `drizzle-kit pull` → scrub postgis internals
 *     (spatial_ref_sys, geo views, spatial sequences) → write
 *     meta/<tag>_snapshot.json with prevId = previous snapshot id,
 *  4. REPLACE the last entry's snapshot with the DECLARATION-serialization
 *     (`drizzle-kit generate` against an empty out dir yields it): pull-based
 *     snapshots carry PG-default FK names + raw-SQL indexes and would make
 *     generate emit destructive drop/rename churn,
 *  5. verify: `drizzle-kit generate` against the real schema.ts + this meta
 *     dir must print "No schema changes, nothing to migrate".
 */

const DRIZZLE_DIR = join(__dirname, '..', '..', 'drizzle');
const META_DIR = join(DRIZZLE_DIR, 'meta');

/** Entries deliberately allowed to lack a snapshot. EMPTY since run #103 —
 * every journal entry (incl. the duplicate 0014_admin_notification_verbs at
 * idx 39) has one; drizzle-kit generate reads a snapshot per journal entry. */
const SNAPSHOT_MISSING: string[] = [];

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function snapshotFileFor(tag: string): string | undefined {
  const full = join(META_DIR, `${tag}_snapshot.json`);
  if (existsSync(full)) return full;
  const prefix = join(META_DIR, `${tag.split('_')[0]}_snapshot.json`);
  if (existsSync(prefix)) return prefix;
  return undefined;
}

describe('drizzle snapshot chain — P2-88 guard (REBUILT, run #103)', () => {
  const journal: { entries: JournalEntry[] } = JSON.parse(
    readFileSync(join(META_DIR, '_journal.json'), 'utf8'),
  );

  it('every journal entry has a snapshot file (no new gaps without a conscious pin)', () => {
    const missing = journal.entries
      .filter((e) => !SNAPSHOT_MISSING.includes(e.tag))
      .filter((e) => !snapshotFileFor(e.tag))
      .map((e) => e.tag);

    expect(missing).toEqual(SNAPSHOT_MISSING);
  });

  it('snapshots are prevId-linked in journal order, anchored at the 0026 snapshot', () => {
    // resolve the anchor id: last OLD-style chain entry (0026)
    const anchorEntry = journal.entries
      .map((e) => e.tag)
      .filter((t) => t.startsWith('0026'))
      .map((t) => snapshotFileFor(t))
      .filter((f): f is string => Boolean(f))
      .map((f) => JSON.parse(readFileSync(f, 'utf8')))[0];
    expect(anchorEntry).toBeDefined();

    let prevId: string = anchorEntry.id;
    for (const e of journal.entries) {
      if (e.idx <= 26) continue; // pre-anchor zone (old-style snapshots, historical links)
      const file = snapshotFileFor(e.tag);
      // NOTE: skip by JOURNAL IDX, never by tag prefix — the duplicate
      // 0014_admin_notification_verbs entry sits at idx 39 (post-anchor) and
      // the chain links THROUGH its snapshot (0038 → 0014b → 0039).
      const snap = JSON.parse(readFileSync(file as string, 'utf8'));
      // jest prints actual vs expected on failure; prevId is a UUID so any
      // mismatch is unambiguous about which link broke
      expect(snap.prevId).toBe(prevId);
      prevId = snap.id;
    }
  });

  it('the anchor (last journal entry) snapshot is declaration-shaped: no PG-default FK names, no raw-SQL-only indexes', () => {
    // The LAST entry's snapshot is what generate diffs against. It must be a
    // declaration-serialization of schema.ts (run #103 recipe step 4), not a
    // DB introspection: introspections carry PG-default FK names
    // (<table>_<col>_fkey) and raw-SQL indexes that trigger drop/rename churn.
    const last = journal.entries[journal.entries.length - 1];
    const file = snapshotFileFor(last.tag);
    expect(file).toBeDefined();
    const snap = JSON.parse(readFileSync(file as string, 'utf8'));

    const allFkNames: string[] = [];
    const allIndexNames: string[] = [];
    for (const tbl of Object.values<typeof snap.tables[string]>(snap.tables)) {
      allFkNames.push(...Object.keys(tbl.foreignKeys ?? {}));
      allIndexNames.push(...Object.keys(tbl.indexes ?? {}));
    }
    expect(allFkNames.filter((n) => /_fkey$/.test(n))).toEqual([]);
    // known raw-SQL indexes (applied via migration files / gist_indexes.sql,
    // invisible to a declaration snapshot)
    for (const raw of ['matches_location_gist_idx', 'venues_location_gist_idx', 'users_email_uidx']) {
      expect(allIndexNames).not.toContain(raw);
    }
  });

  it('guard stays honest: every pinned-missing id corresponds to a real entry', () => {
    const tags = new Set(journal.entries.map((e) => e.tag));
    for (const t of SNAPSHOT_MISSING) {
      expect(tags.has(t)).toBe(true);
    }
  });
});
