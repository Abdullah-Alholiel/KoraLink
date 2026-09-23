import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-92 (run #69): the service worker now handles `pushsubscriptionchange`
 * — browsers rotate web-push subscriptions at any time; without this
 * handler the old endpoint dies server-side while the profile toggle still
 * shows ON (silent push loss until the 90-day stale sweep).
 *
 * The worker has no runtime in vitest (jsdom cannot run a real
 * ServiceWorkerGlobalScope), so — house pattern, cf. P2-74's ws-gate
 * source-reading tripwire — these tests pin the HANDLER SOURCE
 * (worker/index.js is prepended verbatim into the generated sw.js by
 * @ducanh2912/next-pwa; the built worker-<hash>.js is the source of the
 * served worker).
 */

const WORKER_SRC = readFileSync(
  join(__dirname, '../../worker/index.js'),
  'utf-8',
);

describe('worker pushsubscriptionchange (P2-92, run #69) — source tripwire', () => {
  it('registers a pushsubscriptionchange listener', () => {
    expect(WORKER_SRC).toMatch(
      /addEventListener\(\s*['"]pushsubscriptionchange['"]/,
    );
  });

  it('re-subscribes with the SAME public VAPID key the hook uses', () => {
    const keyMatches = WORKER_SRC.match(
      /['"]([A-Za-z0-9_-]{80,120})['"]/g,
    );
    expect(keyMatches).not.toBeNull();
    // The exact public key must appear in the worker (it is public by
    // design; the hook carries the same value).
    expect(
      WORKER_SRC.includes(
        'BEl62iUYgU4x0mQDmvYFz9xSYmIqtrmHQ0IKcJqH2m5RjNK0QPlZcR-JxpjMQm4oBmSmmCm8FzWcMjQBjNt2jJc',
      ),
    ).toBe(true);
    expect(keyMatches!.length).toBeGreaterThanOrEqual(1);
  });

  it('re-upserts the canonical POST subscribe endpoint with credentials', () => {
    // Run #70: the URL is composed from the KV-carried API base (absolute on
    // cross-origin deploys) + the subscribe path; the relative fallback is
    // the same-origin '/api/v1'.
    expect(WORKER_SRC).toContain("/notifications/subscribe`");
    expect(WORKER_SRC).toContain("DEFAULT_API_BASE = '/api/v1'");
    // The fetch must be POST + credentialed (JwtCookieAuthGuard reads the
    // HttpOnly cookie — an uncredentialed re-upsert would 401).
    expect(
      WORKER_SRC.match(
        /fetch\(`\$\{apiBase\}\/notifications\/subscribe`[\s\S]{0,400}?credentials:\s*'include'/,
      ),
    ).not.toBeNull();
  });

  it('reads the locale from the worker-readable push-meta KV with an ar fallback', () => {
    expect(WORKER_SRC).toContain('koralink-push-meta');
    expect(WORKER_SRC).toContain('/__kl/push-locale');
    // Arabic-first default (P2-72 convention) when the KV is missing.
    expect(WORKER_SRC).toMatch(/let locale\s*=\s*'ar'/);
  });

  it('run #70: re-points the new subscription at the KV-carried API base (cross-origin prod)', () => {
    // The worker must read /__kl/push-api-base ({b}) and compose the
    // subscribe URL from it — the old hardcoded relative path resolved
    // against the PWA origin on Vercel prod and 404'd silently.
    expect(WORKER_SRC).toContain("PUSH_API_BASE_KEY = '/__kl/push-api-base'");
    expect(WORKER_SRC).toContain('typeof body.b === ' + "'string'");
    expect(WORKER_SRC).toContain('`${apiBase}/notifications/subscribe`');
  });

  it('run #70: re-subscribes with the KV-carried VAPID key, deployed key as fallback', () => {
    expect(WORKER_SRC).toContain("PUSH_VAPID_KEY = '/__kl/push-vapid'");
    expect(WORKER_SRC).toContain('typeof body.k === ' + "'string'");
    expect(WORKER_SRC).toMatch(
      /let vapidKey\s*=\s*VAPID_PUBLIC_KEY/,
    );
    expect(WORKER_SRC).toContain(
      'pushVapidKeyToUint8Array(vapidKey)',
    );
  });

  it('every failure path is swallowed (no unhandled rejections in the SW)', () => {
    // The handler body is one async IIFE inside event.waitUntil — every
    // failure-prone await (KV read, pushManager.subscribe, fetch) must sit
    // inside a try/catch.
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('pushsubscriptionchange'",
    );
    const handlerEnd = WORKER_SRC.indexOf("addEventListener('push'");
    const body = WORKER_SRC.slice(handlerStart, handlerEnd);
    expect((body.match(/try\s*\{/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((body.match(/catch/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
