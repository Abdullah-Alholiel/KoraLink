import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * RBAC census tripwire (P2-400): every (dashboard) page that renders a write
 * affordance must gate it with `can(` from lib/rbac, so users never see a
 * button the API will 403.
 *
 * Heuristic (deliberately simple — it is a tripwire, not a proof):
 * - "write-ish" = the file mentions a mutation verb (api.post/patch/put/delete,
 *   mutate, useMutation, generate, void, refund, ban, suspend) AND has an
 *   onClick/onSubmit/onChange handler.
 * Limits: it matches words, not call graphs. Writes hidden inside child
 * components (e.g. a drawer that calls api.patch) are only caught when the
 * page itself contains one of the words; a stray word in a comment can flag a
 * read-only page (add it to READ_ONLY with a reason); it does not check that
 * EVERY button is gated, only that the file references `can(` at all.
 */
const WRITE_WORDS =
  /\b(api\.(post|patch|put|delete)|mutate|useMutation|generate|void|refund|ban|suspend)\b/;
const HANDLER = /\bon(Click|Submit|Change)=/;

/** Pages verified to have NO write affordance (word match is incidental). */
const READ_ONLY: string[] = [];

/**
 * Pages WITH a write affordance that has no ConsoleAction token yet. Adding a
 * token is an owner-gated RBAC design change, so these stay listed (not gated)
 * until one exists. They are reachable only by the role that owns the API.
 */
const NO_TOKEN_YET: string[] = [
  'reviews/page.tsx', // hide/restore/delete review — no review.* token
  'partner/earnings/page.tsx', // payout request — no payout.* token
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
const writeish = files.filter((f) => f.rel !== 'layout.tsx' && WRITE_WORDS.test(f.src) && HANDLER.test(f.src));

describe('rbac census', () => {
  it('finds the dashboard pages', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('every write-bearing page references can( or is allowlisted', () => {
    const allow = new Set([...READ_ONLY, ...NO_TOKEN_YET]);
    const offenders = writeish
      .filter((f) => !allow.has(f.rel))
      .filter((f) => !/\bcan\(/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('allowlist entries are still real files and still write-ish (no stale entries)', () => {
    const writeishRel = new Set(writeish.map((f) => f.rel));
    for (const rel of [...READ_ONLY, ...NO_TOKEN_YET]) {
      expect(writeishRel.has(rel), rel).toBe(true);
    }
  });

  it('NO_TOKEN_YET pages do not already use can( (move them out once gated)', () => {
    for (const rel of NO_TOKEN_YET) {
      const f = files.find((x) => x.rel === rel);
      expect(f && /\bcan\(/.test(f.src), rel).toBe(false);
    }
  });

  it('pins the pages already gated', () => {
    const gated = files.filter((f) => /\bcan\(/.test(f.src)).map((f) => f.rel).sort();
    expect(gated).toEqual(
      [
        'disputes/[id]/page.tsx',
        'matches/page.tsx',
        'partner/pitches/page.tsx',
        'partner/settings/page.tsx',
        'partner/venues/page.tsx',
        'pitches/page.tsx',
        'reports/[id]/page.tsx',
        'settings/page.tsx',
        'settlements/page.tsx',
        'transactions/page.tsx',
        'users/[id]/page.tsx',
        'users/page.tsx',
        'venues/[id]/page.tsx',
        'venues/page.tsx',
      ].sort(),
    );
  });
});
