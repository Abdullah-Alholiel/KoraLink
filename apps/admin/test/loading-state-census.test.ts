import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Loading-state census tripwire (P2-417b, run #239): every (dashboard) page
 * must render the shared LoadingState component (P2-274) while its data
 * loads — never a copy-pasted bare text div. The bare-div idiom is exactly
 * the padding/tone drift LoadingState was created to end (18 sites swept in
 * run #239: 9 list pages, 3 detail pages, 6 partner pages).
 *
 * Heuristic (deliberately simple — a tripwire, not a proof): flag any
 * element whose ENTIRE content is a translated `loading*` message. PR-Agent
 * r1 (PR #310): the pattern matches ANY container (div/p/span/section),
 * EITHER quote style and ANY translation alias (`t`, `hq`, `tc`, future
 * ones) — a bare `{t("loading")}` inside a <p> is the same drift. An
 * element with additional children (spinners, buttons) does not match;
 * <LoadingState message={t('loading')} /> does not match (not a bare
 * container). The exact-list pin below anchors the swept files even if a
 * future regression finds a shape the regex misses.
 */
const BARE_LOADING_EL =
  /<(div|p|span|section)[^>]*>\s*\{\s*\w+\((['"])loading[^'"]*\2\)\s*\}\s*<\/\1>/;

/** The 18 files migrated in run #239 — each must keep using LoadingState. */
const SWEPT_FILES = [
  'disputes/[id]/page.tsx',
  'disputes/page.tsx',
  'matches/page.tsx',
  'partner/earnings/page.tsx',
  'partner/matches/[id]/page.tsx',
  'partner/matches/page.tsx',
  'partner/pitches/page.tsx',
  'partner/settings/page.tsx',
  'partner/venues/page.tsx',
  'reports/[id]/page.tsx',
  'reports/page.tsx',
  'reviews/page.tsx',
  'settlements/page.tsx',
  'settings/page.tsx',
  'transactions/page.tsx',
  'users/[id]/page.tsx',
  'users/page.tsx',
  'venues/page.tsx',
];

const ROOT = join(__dirname, '../src/app/(dashboard)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const files = walk(ROOT).map((abs) => ({
  rel: relative(ROOT, abs).split('\\').join('/'),
  src: readFileSync(abs, 'utf8'),
}));

describe('loading-state census', () => {
  it('finds the dashboard pages', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no page renders a bare loading text element (must use LoadingState)', () => {
    const offenders = files
      .filter((f) => BARE_LOADING_EL.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('every file swept in run #239 still uses the shared LoadingState', () => {
    const srcByRel = new Map(files.map((f) => [f.rel, f.src]));
    for (const rel of SWEPT_FILES) {
      const src = srcByRel.get(rel);
      expect(src, `swept file missing: ${rel}`).toBeDefined();
      expect(
        src?.includes('LoadingState'),
        `${rel} lost its LoadingState usage`,
      ).toBe(true);
    }
  });

  it('the shared LoadingState is the loading renderer on 20+ dashboard files', () => {
    const importing = files.filter((f) =>
      f.src.includes("from '@/components/LoadingState'"),
    );
    // 18 migrated in run #239 + 4 pre-existing consumers (dashboard, audit,
    // venues/[id], partner) — a collapse below that means the sweep regressed.
    expect(importing.length).toBeGreaterThanOrEqual(22);
  });
});
