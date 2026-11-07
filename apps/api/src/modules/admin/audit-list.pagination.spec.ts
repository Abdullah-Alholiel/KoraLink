import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P2-318 (run #193, Reviewer A run-#193 IMPORTANT): audit-list pagination
 * contract — one query, stable order, exact total.
 *
 * Locks the three properties the old shape violated:
 * 1. UNIQUE tiebreaker `a.id DESC` after `a.created_at DESC` — bulk admin
 *    actions stamp identical ms timestamps; created_at-only ordering let rows
 *    straddle/duplicate across page fetches.
 * 2. `COUNT(*) OVER()` window count rides the page query — no second COUNT
 *    scan (the §2026-09-22 pagination standard's anti-pattern; same shape as
 *    conversations.service.ts / reports.service.ts).
 * 3. Helper column `total_count` NEVER leaks into the response rows — the
 *    service maps it out before returning; `total` comes from the window
 *    function (0 on an empty page, mirroring the old `?? 0` fallback).
 */
const SRC = join(__dirname);
const SERVICE = readFileSync(join(SRC, 'audit-list.service.ts'), 'utf8');

describe('audit-list pagination contract (P2-318)', () => {
  it('orders by created_at DESC with the unique id DESC tiebreaker', () => {
    expect(SERVICE).toMatch(
      /ORDER BY a\.created_at DESC,\s*a\.id DESC/
    );
    // The bare (unstable) form must be gone.
    expect(SERVICE).not.toMatch(/ORDER BY a\.created_at DESC\s*\n\s*LIMIT/);
  });

  it('computes total via COUNT(*) OVER() in the page query — no second COUNT scan', () => {
    expect(SERVICE).toContain('COUNT(*) OVER()::int AS total_count');
    expect(SERVICE.includes('SELECT COUNT(*)::int')).toBe(false);
  });

  it('strips total_count from response rows and falls back to total 0 on empty page', () => {
    expect(SERVICE).toContain('({ total_count: _tc, ...rest }) => rest');
    expect(SERVICE).toContain("?.total_count === 'number'");
    expect(SERVICE).toMatch(/\?\s*\(rows\[0\] as \{ total_count: number \}\)\.total_count\s*:\s*0/);
  });

  it('keeps the PDPL LEFT JOIN and the escaped ILIKE (P2-292 / run-#94 contracts intact)', () => {
    expect(SERVICE).toContain('LEFT JOIN users u ON u.id = a.admin_id');
    expect(SERVICE).toContain('escapeLikePattern');
  });
});
