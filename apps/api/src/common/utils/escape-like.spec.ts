import { escapeLikePattern } from './escape-like';

describe('escapeLikePattern (P2-158, run #107)', () => {
  it('escapes LIKE wildcards % and _ and backslash', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('under_score')).toBe('under\\_score');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('leaves plain terms untouched', () => {
    expect(escapeLikePattern('Al Nakheel')).toBe('Al Nakheel');
    expect(escapeLikePattern('رياض')).toBe('رياض');
    expect(escapeLikePattern('')).toBe('');
  });

  it('matches the audit.controller reference transformation', () => {
    // Reference: apps/api/src/modules/admin/audit.controller.ts action filter
    // (which builds '%' + term.replace(...) + '%'). The helper IS that middle step.
    const term = '50% off_deal';
    const reference = term.replace(/[\\%_]/g, (m) => '\\' + m);
    expect(escapeLikePattern(term)).toBe(reference);
  });
});
