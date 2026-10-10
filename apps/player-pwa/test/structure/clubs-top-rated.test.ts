/**
 * Structure regression guard — P2-173 "TOP RATED" VENUE SORT (run #119).
 *
 * Run #68 removed a DEAD "Top Rated" pill (venues.rating had no write path).
 * P1-55 (run #117) shipped booking-verified reviews feeding
 * venues.rating_avg/rating_count; P2-173 (run #119) brings the pill back as a
 * REAL server-side sort plus per-card stars.
 *
 * RULES enforced here (structural, zero rendering — same discipline as
 * offline-banner-coverage.test.ts):
 *   1. The clubs page renders a 'Top Rated' pill mapped to clubs.filters.topRated.
 *   2. The pill flips the SERVER sort (?sort=top_rated) — not a client sort.
 *   3. Cards render stars whenever rating_count > 0 (discovery signal on
 *      every tab, not just Top Rated).
 *   4. The i18n key clubs.filters.topRated exists in BOTH en and ar with
 *      equal depth (leaf-key parity rule).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../..');
const PAGE = join(PWA_ROOT, 'src/app/[locale]/(main)/clubs/page.tsx');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

const src = readFileSync(PAGE, 'utf-8');

describe('P2-173 top-rated venue sort (run #119)', () => {
  it('renders the Top Rated pill wired to clubs.filters.topRated', () => {
    expect(src).toContain("'Top Rated'");
    expect(src).toContain("'Top Rated': 'clubs.filters.topRated'");
  });

  it('flips the SERVER sort (sort=top_rated) — not a client-side sort', () => {
    expect(src).toMatch(/sort:\s*activeFilter === 'Top Rated' \? 'top_rated' : undefined/);
  });

  it('renders per-card stars whenever the venue has approved reviews', () => {
    expect(src).toMatch(/venue\.rating_count \?\? 0\) > 0/);
    expect(src).toContain('clubs.filters.rating');
    expect(src).toMatch(/venue\.rating_avg \?\? 0/);
  });

  it('keeps clubs.filters.topRated in BOTH locales with leaf-key parity', () => {
    expect(EN.clubs?.filters?.topRated).toBe('Top Rated');
    expect(AR.clubs?.filters?.topRated).toBe('الأعلى تقييماً');
  });

  it('keeps clubs.filters.rating (star aria-label) in BOTH locales (PR-Agent r1)', () => {
    expect(EN.clubs?.filters?.rating).toBeTruthy();
    expect(AR.clubs?.filters?.rating).toBeTruthy();
  });
});
