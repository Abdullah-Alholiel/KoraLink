/**
 * P2-182 (run #125) structural tripwire: escapeLikePattern is the single
 * source of LIKE/ILIKE wildcard escaping (P2-158, run #107). Run #107 swept
 * SIX unescaped/reimplemented sites; run #125 found the sweep itself had
 * regressed once — admin/audit.controller.ts re-implemented the escape inline
 * while the helper's own doc comment cited it as the reference pattern.
 *
 * This spec fails if any API source file OUTSIDE the helper re-introduces the
 * inline escape char class, so the next drift is caught at PR time instead of
 * two runs later.
 *
 * PR-Agent r1/r2 fixes (run #125):
 * - Matching is FIXED-STRING (grep -F / String.includes), not regex — the
 *   original ERE form collapsed backslashes through the String.raw → shell
 *   double-quote → ERE layers and could never match the two-backslash inline
 *   form, so the tripwire could not fire.
 * - The scanned literal is CONSTRUCTED from parts (charCode 92) so this spec
 *   file does not itself contain the banned sequence — a tripwire must never
 *   flag its own source.
 * - grep exit codes handled explicitly: 1 = clean, 0 = offender found, other
 *   = failed scan → the spec throws; a broken scan can never pass.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', '..');
const BS = String.fromCharCode(92); // one literal backslash, keeps it out of greps
/** The banned inline char class as raw source text: [ + \\ + %_ + ]. */
const INLINE_CLASS = `[${BS}${BS}%_]`;
const HELPER_PATH = join(SRC_ROOT, 'src', 'common', 'utils', 'escape-like.ts');
const AUDIT_PATH = join(SRC_ROOT, 'src', 'modules', 'admin', 'audit.controller.ts');

function scanForInlineClass(): { offenders: string[]; scanFailed?: number } {
  let stdout = '';
  try {
    stdout = execSync(`grep -rlnF --include='*.ts' '${INLINE_CLASS}' ${SRC_ROOT}/src`, {
      encoding: 'utf8',
    });
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 1) return { offenders: [] }; // grep: no matches = clean
    return { offenders: [], scanFailed: status ?? -1 };
  }
  const offenders = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        // The canonical home is src/common/utils/ (helper + its own spec);
        // anywhere else the class is the banned inline re-implementation.
        !l.startsWith(join(SRC_ROOT, 'src', 'common', 'utils')),
    );
  return { offenders };
}

describe('P2-182: escapeLikePattern is the only LIKE-escape implementation (run #125)', () => {
  it('no API source file outside the helper contains the inline escape char class', () => {
    const { offenders, scanFailed } = scanForInlineClass();
    // A failed scan is a failed tripwire, never a pass.
    expect(scanFailed).toBeUndefined();
    // The helper's own regex literal is the one legal occurrence.
    expect(offenders).toEqual([]);
  });

  it('the helper itself still defines the canonical class', () => {
    const helperSrc = readFileSync(HELPER_PATH, 'utf8');
    expect(helperSrc).toContain(INLINE_CLASS);
  });

  it('the audit controller routes its action filter through the shared helper', () => {
    const src = readFileSync(AUDIT_PATH, 'utf8');
    expect(src).toContain('escapeLikePattern');
    expect(src).toContain(`ESCAPE '${BS}${BS}'`);
    // The inline form is gone from this file.
    expect(src.includes(INLINE_CLASS)).toBe(false);
  });
});
