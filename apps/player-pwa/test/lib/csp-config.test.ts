import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P2-42 (run #72): CSP script-src hardening tripwire.
 *
 * next.config.mjs builds the CSP inside a .mjs module that vitest can't
 * import directly (next-pwa/sentry plugin imports at module top level), so
 * these tests read the SOURCE and pin the script-src shape for BOTH branches:
 *
 * PROD branch (the hardening):
 *  - NO 'unsafe-eval' — verified safe: zero `eval(` / `new Function(` in ALL
 *    production client chunks (grep 2026-09-24, run-#72 report);
 *  - NO mapbox / moyasar script entries (DEAD: zero code/deps in the PWA);
 *  - 'unsafe-inline' STAYS — hard evidence (live HTML 2026-09-24): the App
 *    Router response ships 17 inline <script> tags (hydration/flight
 *    bootstrap `self.__next_f.push`), zero src, zero nonce attributes.
 *    Removing the inline allowance without a working nonce pipeline blocks
 *    EVERY page's hydration. Nonce pipeline attempted + blocked with
 *    evidence in docs/plans/run72-csp-hardening/00-retro.md;
 *  - PostHog script host KEPT (posthog-js injects its exception-autocapture
 *    bundle from the -assets host — blocked live in prod 2026-09-09);
 *  - doop design-sync tooling origin KEPT (deliberate, a550815).
 *
 * DEV branch (legacy, byte-for-byte value): keeps unsafe-eval (react-refresh
 * /HMR) + the old host list so local development is untouched.
 */
const configPath = join(__dirname, '..', '..', 'next.config.mjs');
const source = readFileSync(configPath, 'utf8');

function scriptSrcBranches(): { dev: string; prod: string } {
  const start = source.indexOf('const scriptSrc = isDev');
  expect(start, 'scriptSrc ternary missing from next.config.mjs').toBeGreaterThan(-1);
  const devStart = source.indexOf('? [', start);
  const prodStart = source.indexOf(': [', devStart);
  const devEnd = source.indexOf("].join(' ')", devStart);
  const prodEnd = source.indexOf("].join(' ')", prodStart);
  expect(devStart).toBeGreaterThan(devStart - 1);
  expect(prodStart).toBeGreaterThan(devStart);
  expect(devEnd).toBeGreaterThan(devStart);
  expect(prodEnd).toBeGreaterThan(prodStart);
  return {
    dev: source.slice(devStart, devEnd),
    prod: source.slice(prodStart, prodEnd),
  };
}

describe('CSP script-src shape (P2-42 tripwire, pins next.config.mjs)', () => {
  it('prod script-src drops unsafe-eval (verified unused in prod chunks)', () => {
    const { prod } = scriptSrcBranches();
    expect(prod).not.toContain('unsafe-eval');
    expect(prod).toContain("'self'");
  });

  it('prod script-src keeps unsafe-inline (17 nonceless inline bootstrap scripts)', () => {
    const { prod } = scriptSrcBranches();
    expect(prod).toContain("'unsafe-inline'");
  });

  it('prod script-src drops the dead mapbox/moyasar script entries', () => {
    const { prod } = scriptSrcBranches();
    expect(prod).not.toContain('api.mapbox.com');
    expect(prod).not.toContain('cdn.moyasar.com');
  });

  it('prod script-src keeps the live hosts (posthog bundle + doop design-sync)', () => {
    const { prod } = scriptSrcBranches();
    expect(prod).toContain('https://*.posthog.com');
    expect(prod).toContain('https://aa.tail2948f9.ts.net:9460');
  });

  it('dev script-src keeps the legacy permissive value (HMR + old hosts)', () => {
    const { dev } = scriptSrcBranches();
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("'unsafe-inline'");
    expect(dev).toContain('https://api.mapbox.com');
    expect(dev).toContain('https://cdn.moyasar.com');
    expect(dev).toContain('https://*.posthog.com');
  });

  it('style-src still allows inline styles (deliberate, unchanged)', () => {
    // P2-42 final (run #73): mapbox dropped; inline styles stay.
    expect(source).toContain("\"style-src 'self' 'unsafe-inline'\"");
    expect(source).not.toContain("\"style-src 'self' 'unsafe-inline' https://api.mapbox.com\"");
  });

  it('style-src and img-src drop the dead mapbox entries (run #73)', () => {
    expect(source).toContain("\"img-src 'self' data: blob:\"");
    expect(source).not.toContain('*.mapbox.com');
  });

  it('connect-src drops the dead mapbox hosts (run #73)', () => {
    const connectStart = source.indexOf('const connectSrc = [');
    const connectEnd = source.indexOf("].join(' ');", connectStart + 20);
    const connectBlock = source.slice(connectStart, connectEnd);
    expect(connectBlock).not.toContain('api.mapbox.com');
    expect(connectBlock).not.toContain('events.mapbox.com');
  });

  it('connect-src allows cleartext ws: in DEV only — prod is wss:-only (run #73)', () => {
    const connectStart = source.indexOf('const connectSrc = [');
    const connectEnd = source.indexOf("].join(' ');", connectStart + 20);
    const connectBlock = source.slice(connectStart, connectEnd);
    expect(connectBlock).toContain("'wss:'");
    // The only ws: occurrence must be the isDev-conditional spread.
    const wsMatches = connectBlock.match(/'ws:'/g) ?? [];
    expect(wsMatches.length).toBe(1);
    expect(connectBlock).toContain("...(isDev ? ['ws:'] : []),");
  });

  it('CSP header stays wired into headers() with the strict script-src', () => {
    expect(source).toContain("key: 'Content-Security-Policy'");
    expect(source).toContain('`script-src ${scriptSrc}`');
  });

  it('connect-src keeps the apiOrigin derivation (origin only, WS-safe)', () => {
    expect(source).toContain('apiOrigin = new URL(apiUrl).origin');
    expect(source).toContain('`connect-src ${connectSrc}`');
    const connectStart = source.indexOf('const connectSrc = [');
    const connectEnd = source.indexOf("].join(' ');", connectStart + 20);
    const connectBlock = source.slice(connectStart, connectEnd);
    expect(connectBlock).toContain('apiOrigin,');
    expect(connectBlock).not.toContain('process.env.NEXT_PUBLIC_API_URL');
  });
});
