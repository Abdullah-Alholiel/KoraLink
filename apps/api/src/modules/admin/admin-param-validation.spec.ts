import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P2-164 tripwire: every :id / :slotId route param on the admin + partner
 * controllers must be shape-validated by UuidParamPipe. Fails if a future
 * route adds a bare @Param('id') / @Param('slotId').
 */
const MODULES = join(__dirname, '..');
const CONTROLLERS = [
  'admin/audit.controller.ts',
  'admin/disputes.controller.ts',
  'admin/matches.controller.ts',
  'admin/metrics.controller.ts',
  'admin/pitches.controller.ts',
  'admin/reports.controller.ts',
  'admin/settings.controller.ts',
  'admin/settlements.controller.ts',
  'admin/transactions.controller.ts',
  'admin/users.controller.ts',
  'admin/venues.controller.ts',
  'partner/partner.controller.ts',
];

// Any @Param('id' | 'slotId' ...) decorator, quote-style agnostic.
const ID_PARAM = /@Param\(\s*(['"`])(id|slotId)\1([^)]*)\)/g;
const WITH_PIPE = /^\s*,\s*UuidParamPipe\s*$/;

describe('admin/partner route-param validation tripwire (P2-164)', () => {
  let total = 0;

  it.each(CONTROLLERS)('%s: every id/slotId @Param uses UuidParamPipe', (rel) => {
    const src = readFileSync(join(MODULES, rel), 'utf8');
    const offenders: string[] = [];
    for (const m of src.matchAll(ID_PARAM)) {
      total += 1;
      if (!WITH_PIPE.test(m[3])) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('settings :key param stays a plain string key (not UUID-validated)', () => {
    const src = readFileSync(join(MODULES, 'admin/settings.controller.ts'), 'utf8');
    expect(src).toMatch(/@Param\('key'\)/);
    expect(src).not.toMatch(/UuidParamPipe/);
  });

  it('scan actually found the guarded params (guards against a vacuous pass)', () => {
    expect(total).toBeGreaterThanOrEqual(37);
  });
});
