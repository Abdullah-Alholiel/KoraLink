import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-98 tripwire (run #71): scripts/migrate-vps.mjs must apply each migration
 * file as ONE transaction — statements + the journal insert commit or roll
 * back TOGETHER. Reviewer A (run #71) found the pre-fix loop applied
 * statements with no per-file tx: a mid-file failure left earlier statements
 * applied with NO journal row, so a re-run re-executed them (harmless for DDL
 * via the duplicate tolerance, but non-idempotent DML was re-applied).
 *
 * This is a STATIC structure spec (the script is a standalone .mjs not
 * importable in jest): it pins the load-bearing lines so a future refactor
 * cannot silently drop the atomicity contract. Pair with
 * drizzle-snapshot-chain.spec.ts (P2-88 guard) in the same lane.
 */

const SCRIPT_PATH = join(__dirname, '..', '..', '..', '..', 'scripts', 'migrate-vps.mjs');

describe('migrate-vps.mjs per-file transaction contract (P2-98, run #71)', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');

  it('applies statements inside sql.begin (one tx per file)', () => {
    expect(src).toMatch(/await sql\.begin\(async \(tx\) =>/);
    // statements execute on the TX handle, not the bare connection
    expect(src).toMatch(/sp\.unsafe\(stmt\)/);
  });

  it('journals INSIDE the transaction (apply+journal atomic)', () => {
    const beginIdx = src.indexOf('await sql.begin(');
    const txJournalIdx = src.indexOf('await tx.unsafe(`INSERT INTO ${t.fq}');
    expect(beginIdx).toBeGreaterThan(-1);
    expect(txJournalIdx).toBeGreaterThan(beginIdx);
    // the old out-of-tx journal insert must be gone
    expect(src).not.toMatch(/await sql\.unsafe\(`INSERT INTO \$\{t\.fq\}/);
  });

  it('duplicate-DDL tolerance is SAVEPOINT-scoped and failures roll back + exit 5', () => {
    // P2-80 semantics preserved: tolerated classes continue, everything else aborts
    expect(src).toMatch(/DUP_CODES\.has\(e\.code\)/);
    expect(src).toMatch(/tx\.savepoint\(async \(sp\)/);
    // non-tolerated failure = sentinel → ROLLBACK → hard exit before newer files
    expect(src).toMatch(/rollback sentinel/);
    expect(src).toMatch(/process\.exit\(5\)/);
  });
});
