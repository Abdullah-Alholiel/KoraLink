import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-281 M-4 — Reports page lifecycle copy (Reviewer B run #176: status was
 * chip-only; players need a plain-language "what happens to my refund" line
 * per state).
 *
 * Structure-guard discipline: pins the pure status→key maps (including the
 * money-truth split — dispute `resolved` carries the refund line, report
 * `resolved` does NOT) and EN/AR key parity.
 */
const PWA_ROOT = join(__dirname, '../..');
const LIB = readFileSync(join(PWA_ROOT, 'src/lib/lifecycle.ts'), 'utf-8');
const PAGE = readFileSync(join(PWA_ROOT, 'src/app/[locale]/(main)/reports/page.tsx'), 'utf-8');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

describe('P2-281 M-4 reports lifecycle copy (structure + maps)', () => {
  it('maps every report status; unknown → null', () => {
    const lib = require(join(PWA_ROOT, 'src/lib/lifecycle.ts')) as {
      reportLifecycleKey: (s: string) => string | null;
      disputeLifecycleKey: (s: string) => string | null;
    };
    expect(lib.reportLifecycleKey('open')).toBe('lifecycle.open');
    expect(lib.reportLifecycleKey('reviewing')).toBe('lifecycle.reviewing');
    expect(lib.reportLifecycleKey('resolved')).toBe('lifecycle.resolved');
    expect(lib.reportLifecycleKey('dismissed')).toBe('lifecycle.dismissed');
    expect(lib.reportLifecycleKey('nonsense')).toBeNull();

    expect(lib.disputeLifecycleKey('opened')).toBe('lifecycle.opened');
    expect(lib.disputeLifecycleKey('under_review')).toBe('lifecycle.underReview');
    expect(lib.disputeLifecycleKey('resolved')).toBe('lifecycle.disputeResolved');
    expect(lib.disputeLifecycleKey('rejected')).toBe('lifecycle.rejected');
    expect(lib.disputeLifecycleKey('nonsense')).toBeNull();
  });

  it('MONEY TRUTH: refund line lives on disputeResolved, NOT on report resolved', () => {
    expect(EN.reports.lifecycle.disputeResolved).toContain('wallet');
    expect(AR.reports.lifecycle.disputeResolved).toContain('محفظتك');
    expect(EN.reports.lifecycle.resolved).not.toContain('refund');
    expect(EN.reports.lifecycle.resolved).not.toContain('wallet');
  });

  it('renders the lifecycle line on BOTH the report card and the dispute card', () => {
    expect(PAGE).toContain('reportLifecycleKey');
    expect(PAGE).toContain('disputeLifecycleKey');
  });

  it('all 8 lifecycle keys exist in BOTH locales', () => {
    const keys = [
      'open', 'reviewing', 'resolved', 'dismissed',
      'opened', 'underReview', 'disputeResolved', 'rejected',
    ];
    for (const k of keys) {
      expect(EN.reports.lifecycle[k]).toBeTruthy();
      expect(AR.reports.lifecycle[k]).toBeTruthy();
    }
  });
});
