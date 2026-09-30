/**
 * Structure regression guard — ERROR COPY STANDARD (run #88, P2-127).
 *
 * Background: nine user-facing error surfaces rendered the flat generic
 * `t('common.error')` with no what-happened / why / what-next structure. They
 * now route through `classifyError()` + `errorKey()` (src/lib/error-classify.ts)
 * so users see authored, localized copy per failure kind.
 *
 * RULES enforced here (structural, zero rendering):
 *  1. No file under src/app renders `t('common.error')`.
 *  2. Each migrated surface uses `errorKey(classifyError(`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PWA_ROOT = join(__dirname, '../../');
const src = (p: string) => readFileSync(join(PWA_ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const MIGRATED = [
  'src/app/[locale]/(main)/clubs/page.tsx',
  'src/app/[locale]/(main)/my-games/page.tsx',
  'src/app/[locale]/(main)/play/page.tsx',
  'src/app/[locale]/(main)/profile/page.tsx',
  'src/app/[locale]/(main)/personal-info/page.tsx',
  'src/app/[locale]/(main)/wallet/page.tsx',
  'src/app/[locale]/(main)/messages/page.tsx',
  'src/app/[locale]/match/[id]/page.tsx',
  'src/app/[locale]/messages/[id]/page.tsx',
];

describe('error copy standard (P2-127)', () => {
  it("no src/app file renders generic error copy (common.error / errorDescription)", () => {
    // Ban BOTH generic keys and BOTH quote styles: t("common.error") evades a
    // single-quote-only check, and common.errorDescription is the same flat-
    // copy smell in a different key (P2-127 PR-Agent round-1 note).
    const offenders = walk(join(PWA_ROOT, 'src/app'))
      .map((f) => ({ f, s: readFileSync(f, 'utf8') }))
      .filter(({ s }) =>
        /t\(['"]common\.error['"]\)/.test(s) ||
        /common\.errorDescription/.test(s))
      .map(({ f }) => relative(PWA_ROOT, f));
    expect(offenders).toEqual([]);
  });

  it.each(MIGRATED)('%s renders classified error copy', (file) => {
    expect(src(file)).toContain('errorKey(classifyError(');
  });
});
