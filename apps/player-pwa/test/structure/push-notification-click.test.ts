import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-93 (run #70): the notificationclick handler must never HARD-navigate an
 * existing PWA window — `client.navigate()` wipes in-memory state (Zustand,
 * React Query cache, chat drafts, scroll) even when the window is already on
 * the target route. Behavior pinned here (source tripwire, house pattern cf.
 * push-subscription-change.test.ts):
 *
 *   1. same-origin guard on the notification URL;
 *   2. window already on the route → focus ONLY (no navigate, no message);
 *   3. window elsewhere → postMessage('kl-push-nav') + focus;
 *   4. no window → openWindow;
 *   5. the page-side listener (PushNavHandler) does the soft router.push.
 *
 * The worker has no runtime in vitest (jsdom cannot run a real
 * ServiceWorkerGlobalScope), so — as with P2-92 — these tests read the
 * handler SOURCE (worker/index.js is prepended verbatim into the generated
 * sw.js by @ducanh2912/next-pwa).
 */

const WORKER_SRC = readFileSync(
  join(__dirname, '../../worker/index.js'),
  'utf-8',
);

const HANDLER_SRC = readFileSync(
  join(
    __dirname,
    '../../src/components/layout/PushNavHandler.tsx',
  ),
  'utf-8',
);

describe('notificationclick guarded navigation (P2-93, run #70) — source tripwire', () => {
  it('registers a notificationclick listener', () => {
    expect(WORKER_SRC).toMatch(
      /addEventListener\(\s*['"]notificationclick['"]/,
    );
  });

  it('guards the deep link to the worker origin (no off-origin navigation)', () => {
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('notificationclick'",
    );
    const body = WORKER_SRC.slice(handlerStart);
    expect(body).toMatch(
      /new URL\(rawUrl,\s*self\.location\.origin\)/,
    );
    expect(body).toMatch(
      /resolved\.origin\s*!==\s*self\.location\.origin/,
    );
  });

  it('focuses WITHOUT navigating when a window is already on the target route', () => {
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('notificationclick'",
    );
    const body = WORKER_SRC.slice(handlerStart);
    expect(body).toContain('alreadyThere');
    expect(body).toContain('cur.pathname === target.pathname');
    expect(body).toContain('if (alreadyThere) return client.focus();');
  });

  it('postMessages kl-push-nav + focuses when the window is elsewhere', () => {
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('notificationclick'",
    );
    const body = WORKER_SRC.slice(handlerStart);
    expect(body).toContain("type: 'kl-push-nav'");
    expect(body).toContain('client.postMessage({ type');
  });

  it('does NOT call client.navigate anywhere in the handler', () => {
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('notificationclick'",
    );
    const body = WORKER_SRC.slice(handlerStart);
    // Strip comments first — the design note names the old pattern and must
    // not trip this assertion.
    const codeOnly = body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/client\.navigate\s*\(/);
  });

  it('falls back to openWindow when no window exists', () => {
    const handlerStart = WORKER_SRC.indexOf(
      "addEventListener('notificationclick'",
    );
    const body = WORKER_SRC.slice(handlerStart);
    expect(body).toContain('self.clients.openWindow(url)');
  });

  it('page-side PushNavHandler listens for kl-push-nav and soft-navigates', () => {
    expect(HANDLER_SRC).toContain("data.type !== 'kl-push-nav'");
    expect(HANDLER_SRC).toContain("data.url.startsWith('/')");
    expect(HANDLER_SRC).toContain('router.push(data.url)');
    expect(HANDLER_SRC).toContain(
      "navigator.serviceWorker.addEventListener('message'",
    );
  });

  it('PushNavHandler is mounted in the [locale] layout', () => {
    const layout = readFileSync(
      join(__dirname, '../../src/app/[locale]/layout.tsx'),
      'utf-8',
    );
    expect(layout).toContain('PushNavHandler');
  });
});
