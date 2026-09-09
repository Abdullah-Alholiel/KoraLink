import { describe, it, expect } from 'vitest';
import { config } from '@/middleware';

/**
 * Regression tests for the PWA-artifact matcher exclusions (prod console
 * noise, 2026-09-09): the old matcher only excluded the bare `manifest.json`,
 * so next-intl 307'd `/manifest.ar.json` → `/en/manifest.ar.json` → 404 and
 * Workbox failed its precache install with bad-precaching-response for every
 * returning user. All three manifests must bypass locale routing.
 */
function matcherExcludes(pathname: string): boolean {
  const source = config.matcher[0];
  // Next wraps the matcher source as `^/(...)$` and RUNS it against the
  // pathname: a match means the middleware PROCESSES the path, no match
  // means the path BYPASSES locale routing. So "excluded" = !re.test().
  const re = new RegExp('^/(?:' + source.replace(/^\//, '') + ')$');
  return !re.test(pathname);
}

describe('middleware matcher — PWA artifacts bypass locale routing', () => {
  it('excludes all three locale manifests plus the bare one', () => {
    expect(matcherExcludes('/manifest.json')).toBe(true);
    expect(matcherExcludes('/manifest.ar.json')).toBe(true);
    expect(matcherExcludes('/manifest.en.json')).toBe(true);
  });

  it('still excludes the other static artifacts', () => {
    expect(matcherExcludes('/sw.js')).toBe(true);
    expect(matcherExcludes('/workbox-7a232229.js')).toBe(true);
    expect(matcherExcludes('/worker-1de822a9f0f86df2.js')).toBe(true);
    expect(matcherExcludes('/fallback-ce627215c0e4a9af.js')).toBe(true);
    expect(matcherExcludes('/favicon.ico')).toBe(true);
    expect(matcherExcludes('/landing/draft-a-player/index.html')).toBe(true);
  });

  it('still routes pages through the locale middleware', () => {
    expect(matcherExcludes('/en/play')).toBe(false);
    expect(matcherExcludes('/ar/match/abc')).toBe(false);
    expect(matcherExcludes('/login')).toBe(false);
    expect(matcherExcludes('/en/match/xyz/messages')).toBe(false);
  });
});
