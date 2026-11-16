/**
 * Structure regression guard — CONSENT-GATED SW ACTIVATION (P2-126, run #89).
 *
 * A mid-session deploy must never force-reload the app (form/draft loss).
 * The built sw.js must NOT skip waiting unconditionally: workbox is built with
 * `skipWaiting: false`, and the only `self.skipWaiting()` call in the worker
 * extension lives inside the SKIP_WAITING message listener that
 * ServiceWorkerUpdater posts to after user consent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../..');

describe('structure: consent-gated service-worker activation', () => {
  it('next.config.mjs builds workbox with skipWaiting: false', () => {
    const src = readFileSync(join(PWA_ROOT, 'next.config.mjs'), 'utf8');
    expect(src).toContain('skipWaiting: false');
    expect(src).not.toMatch(/skipWaiting:\s*true/);
  });

  it('worker/index.js only skips waiting inside the SKIP_WAITING message listener', () => {
    const src = readFileSync(join(PWA_ROOT, 'worker/index.js'), 'utf8');
    const listenerRe =
      /self\.addEventListener\('message',\s*\(event\)\s*=>\s*\{\s*if\s*\(event\.data && event\.data\.type === 'SKIP_WAITING'\)\s*self\.skipWaiting\(\);\s*\}\);/;
    expect(src).toMatch(listenerRe);
    expect(src.replace(listenerRe, '')).not.toMatch(/self\.skipWaiting\(\)/);
  });
});
