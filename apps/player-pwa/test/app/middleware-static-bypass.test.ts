/**
 * Tripwire (P0-2, 2026-11-13): every static artifact class the PWA serves
 * must be listed in the next-intl matcher's negative lookahead. An unlisted
 * static path is 307'd to /<locale>/… and 404s — /vendor/** broke exactly
 * this way after the Moyasar form went self-hosted (the form script 307'd
 * → /ar/vendor/… → 404 → card form never rendered). Mirrors the shape-pinning
 * approach of test/lib/csp-config.test.ts: the matcher is applied by the Next
 * runtime, so a source pin is the only honest unit-level gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, '../../src/middleware.ts'), 'utf-8');
const matcherLine = src.split('\n').find((l) => l.includes("'/(("));
// capture the full lookahead: everything between (?! and the ) that closes it
// (the one directly preceding .*) — robust against inner (?:...) groups).
const negation = matcherLine?.match(/\(\?!([\s\S]*?)\)\.\*\)/)?.[1] ?? '';

describe('middleware matcher exempts static artifact classes (307→404 tripwire)', () => {
  it('the matcher line exists in src/middleware.ts', () => {
    expect(matcherLine).toBeTruthy();
  });

  it.each([
    'api',
    'vendor',
    '_next/static',
    '_next/image',
    'favicon.ico',
    'manifest',
    'sw\\\\.js',
    'fallback-',
  ])('%s stays in the negative lookahead (removal = 307→404 regression)', (alt) => {
    expect(negation).toContain(alt);
  });

  it('vendor sits right after api (the 2026-11-13 addition, ordering pin)', () => {
    expect(negation.startsWith('api|vendor|')).toBe(true);
  });

  it('locale routing is localePrefix "always" (unchanged contract)', () => {
    expect(src).toContain("localePrefix: 'always'");
  });
});
