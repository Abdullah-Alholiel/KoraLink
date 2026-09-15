/**
 * Structure regression guard — OFFLINE STALENESS SIGNAL ON HIGH-VALUE SURFACES.
 *
 * Background (run #53): match detail was the LAST main PWA surface without an
 * offline affordance — the SW (P2-57) serves match/club data from cache while
 * offline, so a stale roster/join state read exactly like live data. Reviewer
 * B (run #53) flagged it P1; the same gap was closed for club detail in run
 * #52 (1066a29).
 *
 * RULE enforced here: the surfaces below render live-ish, decision-driving
 * data (join/booking state, roster) and MUST import + render OfflineBanner
 * with useOnlineStatus. Structural on purpose — catches the bug class at CI
 * time with zero rendering, like no-unportaled-overlays.test.ts.
 *
 * Adding a new surface that reads match/roster/booking data? Add it to
 * REQUIRED_SURFACES (the test fails until the banner exists).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../..');
const APP_DIR = join(PWA_ROOT, 'src/app/[locale]');

/** Relative-to-[locale] paths that MUST carry the staleness signal. */
const REQUIRED_SURFACES: Record<string, string> = {
  'match/[id]/page.tsx': 'roster + join/booking CTAs — offline state must never read as live',
  'clubs/[id]/page.tsx': 'club profile + match list (run #52)',
};

describe('offline staleness signal coverage (run #53)', () => {
  for (const [relPath, reason] of Object.entries(REQUIRED_SURFACES)) {
    it(`renders OfflineBanner via useOnlineStatus on ${relPath} — ${reason}`, () => {
      const file = join(APP_DIR, relPath);
      expect(existsSync(file)).toBe(true);
      const src = readFileSync(file, 'utf-8');
      expect(src).toContain('useOnlineStatus');
      expect(src).toContain('OfflineBanner');
      // The banner must actually be rendered (not just imported).
      expect(src).toMatch(/<OfflineBanner\s/);
    });
  }
});
