import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-78 tripwire (run #59): scripts/migrate-vps.mjs "already exists" tolerance
 * must cover DDL-duplicate error classes ONLY. A data-level code (23505
 * unique_violation) in that list silently half-applies a data-touching
 * migration: the failed statement is logged as "tolerated", the file is
 * hash-journaled as APPLIED, and the deploy continues on a wrong DB state.
 * 23505 shipped in the original tolerance set (2c88dd5); no committed
 * migration carries a real data INSERT today, so removing it is behavior-
 * preserving for every existing re-run path while closing the latent hazard.
 *
 * The set lives inside the applier script (which opens a DB connection at
 * import time), so this spec reads the source instead of importing it. Any
 * future addition to the set must consciously update this pin.
 */

const SCRIPT = join(__dirname, '..', '..', '..', '..', 'scripts', 'migrate-vps.mjs');

/** DDL duplicate-object error classes that are genuinely safe to tolerate. */
const REQUIRED_DDL_CODES = ['42P07', '42710', '42701', '42P06'];

/** Data-level classes that must NEVER be tolerated. */
const FORBIDDEN_DATA_CODES = ['23505'];

function readDupCodesSource(): string {
  const src = readFileSync(SCRIPT, 'utf8');
  const match = src.match(/const DUP_CODES = new Set\(\[([^\]]*)\]\)/);
  if (!match) {
    throw new Error('DUP_CODES declaration not found in scripts/migrate-vps.mjs — did the script structure change?');
  }
  return match[1];
}

describe('migrate-vps.mjs DUP_CODES tolerance (P2-78 pin, run #59)', () => {
  const dupCodesSource = readDupCodesSource();

  it('contains each required DDL-duplicate code', () => {
    for (const code of REQUIRED_DDL_CODES) {
      expect(dupCodesSource).toContain(`'${code}'`);
    }
  });

  it('does NOT tolerate data-level unique_violation (23505)', () => {
    for (const code of FORBIDDEN_DATA_CODES) {
      expect(dupCodesSource).not.toContain(`'${code}'`);
    }
  });

  it('pins the tolerance list to exactly the four DDL codes', () => {
    const codes = [...dupCodesSource.matchAll(/'([0-9A-Z]{5})'/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual([...REQUIRED_DDL_CODES].sort());
    expect(codes).toHaveLength(4);
  });

  it('keeps the broad /already exists/ message fallback for unusual duplicate wordings', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    // P2-80 (run #63): the fallback must remain, but GATED on the error
    // carrying no SQLSTATE — a coded data-level failure (23505) whose message
    // happens to contain "already exists" (custom trigger/RAISE wording) must
    // fail loud, not be tolerated and half-applied.
    expect(src).toMatch(/already exists/i);
    expect(src).toMatch(/!\s*e\.code\s*&&\s*\/already exists\/i/);
  });

  it('gates the message fallback on the absence of a SQLSTATE (P2-80, run #63)', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(
      /DUP_CODES\.has\(e\.code\)\s*\|\|\s*\(!e\.code\s*&&\s*\/already exists\/i\.test\(e\.message \?\? ''\)\)/,
    );
  });
});
