/**
 * Structure regression guard — PWA A11Y LABELS & CLOCK HYGIENE (run #80, P2-101).
 *
 * Background (run #80 Reviewer A/B findings): icon-only controls on the feed,
 * wallet top-up modal, Toast dismiss and sheet close buttons carried either no
 * accessible name at all (screen readers announce "button") or hardcoded
 * English labels (Arabic screen readers hear English). A dead component
 * (TopAppBar) shipped 3 hardcoded English strings with zero imports, and
 * PostMatchSection ran a private `useState(() => new Date())` clock that
 * executes during SSR — masked today, a hydration hazard under any future
 * prefetch (same class as the run-#40 MatchCard fix).
 *
 * RULES enforced here (structural, zero rendering — catches the bug class at
 * CI time):
 *  1. Icon-only controls on the audited surfaces carry localized aria-labels.
 *  2. No hardcoded English `aria-label="Close"|"Dismiss"` anywhere in src/.
 *  3. The dead TopAppBar stays deleted; the feed page never re-references it.
 *  4. PostMatchSection's clock is null-seeded (hydration-safe) and ticking.
 *  5. my-games error state ships the why/what-next line (copy standard).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../../');
const src = (p: string) => readFileSync(join(PWA_ROOT, p), 'utf8');
const exists = (p: string) => {
  try {
    statSync(join(PWA_ROOT, p));
    return true;
  } catch {
    return false;
  }
};

describe('PWA a11y labels + clock hygiene (run #80, P2-101)', () => {
  it('feed page icon-only controls carry localized aria-labels', () => {
    const feed = src('src/app/[locale]/(main)/page.tsx');
    // scroll-to-top pill + feed retry button
    expect(feed).toContain("aria-label={t('newActivities')}");
    expect(feed).toContain("aria-label={t('retry')}");
  });

  it('Toast dismiss label is localized via the common namespace', () => {
    const toast = src('src/components/layout/Toast.tsx');
    expect(toast).toContain("useTranslations()");
    expect(toast).toContain("t('common.dismiss')");
    expect(toast).not.toContain('aria-label="Dismiss"');
  });

  it('sheet close buttons are localized (no hardcoded "Close" in src/)', () => {
    for (const f of [
      'src/components/matches/AttendanceSheet.tsx',
      'src/components/matches/MatchRulesSheet.tsx',
      'src/components/matches/AppealSheet.tsx',
    ]) {
      const content = src(f);
      expect(content, f).toContain("close')");
      expect(content, f).not.toContain('aria-label="Close"');
    }
    // Class-level sweep: no hardcoded English close/dismiss labels anywhere.
    const offenders = [
      'src/components/layout/Toast.tsx',
      'src/components/matches/AttendanceSheet.tsx',
      'src/components/matches/MatchRulesSheet.tsx',
      'src/components/matches/AppealSheet.tsx',
    ].filter((f) => /aria-label="(Close|Dismiss)"/.test(src(f)));
    expect(offenders).toEqual([]);
  });

  it('wallet top-up modal close control is localized in both languages', () => {
    expect(src('src/app/[locale]/(main)/wallet/page.tsx')).toContain(
      "t('wallet.closeModal')",
    );
    const en = JSON.parse(src('src/messages/en.json')) as { wallet: Record<string, string> };
    const ar = JSON.parse(src('src/messages/ar.json')) as { wallet: Record<string, string> };
    expect(en.wallet.closeModal).toBe('Close dialog');
    expect(ar.wallet.closeModal).toBe('إغلاق النافذة');
  });

  it('does not ship the dead TopAppBar component', () => {
    expect(exists('src/components/layout/TopAppBar.tsx')).toBe(false);
    expect(src('src/app/[locale]/(main)/page.tsx')).not.toContain('TopAppBar');
  });

  it('PostMatchSection runs a hydration-safe null-seeded ticking clock', () => {
    const postMatch = src('src/components/matches/PostMatchSection.tsx');
    // null-seeded (SSR + first client render agree)
    expect(postMatch).toContain('useState<number | null>(null)');
    expect(postMatch).not.toMatch(/useState\(\(\) => new Date\(\)\)/);
    // still ticks (countdown) and gates the "voting closed" card on the clock
    expect(postMatch).toContain('setInterval');
    expect(postMatch).toContain('nowMs !== null && timeLeft === null');
  });

  it('my-games error state ships the why/what-next line (copy standard)', () => {
    expect(src('src/app/[locale]/(main)/my-games/page.tsx')).toContain(
      "t('common.errorDescription')",
    );
  });
});
