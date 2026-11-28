import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Loading-state census tripwire (P2-417b, run #239): every (dashboard) page
 * must render the shared LoadingState component (P2-274) while its data
 * loads — never a bare copy-pasted text div. The bare-div idiom is exactly
 * the padding/tone drift LoadingState was created to end (18 sites swept in
 * run #239: 9 list pages, 3 detail pages, 6 partner pages).
 *
 * Heuristic (deliberately simple — a tripwire, not a proof): flag any
 * <div> whose ENTIRE content is a translated `loading*` message. A div with
 * additional children (spinners, buttons) does not match; <LoadingState
 * message={t('loading')} /> does not match (it is not a <div>).
 */
const BARE_LOADING_DIV =
  /<div[^>]*>\s*\{\s*(?:hq|t|tc|th)\('loading[^']*'\)\s*\}\s*<\/div>/;

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

  it('no page renders a bare loading text div (must use LoadingState)', () => {
    const offenders = files
      .filter((f) => BARE_LOADING_DIV.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
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
