import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-88 guard (run #71): the drizzle meta snapshot chain is TORN. Snapshots
 * exist for 0000–0026, then 0029 (with `prev: null` — not chained), and
 * nothing for 0027/0028/0030–0043. The hand-written-0030+ convention means a
 * migration without a snapshot is EXPECTED — but the chain must not grow
 * silently, and the day `drizzle-kit generate` runs against this directory it
 * would diff from a 17-migrations-stale base and emit wrong/destructive DDL.
 *
 * These tests PIN the known torn state so any change is a loud, deliberate
 * act:
 *  - a rebuild of the missing snapshots flips both tests red → update the
 *    pins in the SAME commit as the rebuild (the new state is `missing: []`);
 *  - a NEW hand-written migration without a snapshot also flips red → either
 *    regenerate the chain or consciously extend the pin (and leave a comment
 *    for the rebuild cycle).
 *
 * If both pins read "expected" and stay green, nothing about the chain has
 * changed. A skipped test would be invisible; a pinned one is a tripwire in
 * BOTH directions. Full rebuild = dedicated half-cycle (needs `drizzle-kit`
 * on a machine where it installs — not this VPS).
 */

const DRIZZLE_DIR = join(__dirname, '..', '..', 'drizzle');
const META_DIR = join(DRIZZLE_DIR, 'meta');

/** Migrations shipped deliberately without snapshot json (runbook convention for
 * hand-written files; 0027/0028 are the torn-chain gap run #67 flagged). */
const SNAPSHOT_MISSING = [
  '0027', '0028',
  '0030', '0031', '0032', '0033', '0034', '0035', '0036', '0037',
  '0038', '0039', '0040', '0041', '0042', '0043',
];

describe('drizzle snapshot chain — P2-88 guard (run #71)', () => {
  it('torn chain state is exactly as pinned (0026 ok, 0027/0028 missing, 0029 orphaned with prev:null)', () => {
    expect(existsSync(join(META_DIR, '0026_snapshot.json'))).toBe(true);
    expect(existsSync(join(META_DIR, '0027_snapshot.json'))).toBe(false);
    expect(existsSync(join(META_DIR, '0028_snapshot.json'))).toBe(false);
    expect(existsSync(join(META_DIR, '0029_snapshot.json'))).toBe(true);

    const snap29 = JSON.parse(readFileSync(join(META_DIR, '0029_snapshot.json'), 'utf8'));
    // The orphan marker: 0029 was generated WITHOUT a parent snapshot, so its
    // `prev` link is absent entirely (the key does not exist — not even null).
    expect(snap29.prev).toBeUndefined();
  });

  it('no NEW migration deepens the snapshot gap without a conscious pin update', () => {
    const numbered = readdirSync(DRIZZLE_DIR)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .map((f) => f.slice(0, 4));

    const missing = numbered.filter(
      (n) => !existsSync(join(META_DIR, `${n}_snapshot.json`)),
    );

    expect(missing).toEqual(SNAPSHOT_MISSING);
  });

  it('guard stays honest: the pin itself must not drift from reality (files exist for all pinned ids)', () => {
    // Every pinned id must correspond to a real migration file — if a pin
    // entry is renamed/removed from the disk, this test fails until the pin
    // is updated, keeping the guard self-consistent.
    for (const n of SNAPSHOT_MISSING) {
      expect(
        readdirSync(DRIZZLE_DIR).some((f) => f.startsWith(`${n}_`) && f.endsWith('.sql')),
      ).toBe(true);
    }
  });
});
