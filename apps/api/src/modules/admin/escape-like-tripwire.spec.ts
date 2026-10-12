/**
 * P2-182 (run #125) structural tripwire: escapeLikePattern is the single
 * source of LIKE/ILIKE wildcard escaping (P2-158, run #107). Run #107 swept
 * SIX unescaped/reimplemented sites; run #125 found the sweep itself had
 * regressed once — admin/audit.controller.ts re-implemented the escape inline
 * while the helper's own doc comment cited it as the reference pattern.
 *
 * This spec fails if any API source file OUTSIDE the helper re-introduces the
 * inline `[\\\\%_]` escape regex, so the next drift is caught at PR time
 * instead of two runs later.
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', '..');
const INLINE_REGEX = String.raw`replace\(/\[\\%_\]/g`;

describe('P2-182: escapeLikePattern is the only LIKE-escape implementation (run #125)', () => {
  it('no API source file re-implements the inline wildcard-escape regex', () => {
    let hits = '';
    try {
      hits = execSync(
        `grep -rln --include='*.ts' -E "${INLINE_REGEX}" ${SRC_ROOT}/src | grep -v escape-like.ts || true`,
        { encoding: 'utf8' },
      );
    } catch {
      // grep exits 2 on unreadable paths; treat as failure to run, not as pass.
      throw new Error('tripwire grep failed to execute');
    }
    expect(hits.trim()).toBe('');
  });

  it('the audit controller routes its action filter through the shared helper', () => {
    const src = require('fs').readFileSync(
      join(SRC_ROOT, 'src', 'modules', 'admin', 'audit.controller.ts'),
      'utf8',
    );
    expect(src).toContain('escapeLikePattern');
    expect(src).toContain("ESCAPE '\\\\'");
    // The inline form is gone.
    expect(src).not.toMatch(new RegExp(INLINE_REGEX));
  });
});
