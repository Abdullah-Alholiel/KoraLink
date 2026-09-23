// Custom service-worker extension for @ducanh2912/next-pwa.
// This file is prepended to the generated workbox sw.js — it adds Web Push
// handling (US10): background notifications for DMs, match chat, POTM.
// Deep-link routing: match-chat → /<locale>/match/<id>, dm → /<locale>/messages/<id>.

// Offline navigation fallback (P2-40, run #23): workbox's document fallback
// (`fallbacks.document: '/ar/offline'`) only fires via handlerDidError on the
// routes registered in next.config.mjs — the worker's own fetch listener runs
// FIRST (importScripts'd before precacheAndRoute/registerRoute), intercepting
// /en|/ar document navigations: network-first, and on network failure serve
// the locale-matching offline page from cache. The offline page itself
// re-detects locale from the pathname, so copy always matches the user's
// locale.

// Offline URL restore (P2-73, run #64): before serving the offline page, the
// failed navigation's URL is saved into a tiny Cache-API KV
// (cache `koralink-offline-restore`, key '/__kl/restore-url', JSON `{u, t}`).
// The offline page reads it (src/lib/sw-offline-restore.ts) and offers a
// localized "back to the page" CTA. Cache-API KV is used because
// sessionStorage/localStorage do not exist inside a service worker. The
// entry is cleared on the next SUCCESSFUL document navigation (success path
// below), so the restore target never outlives the offline journey (plus the
// 24h TTL applied on read).

/* eslint-disable no-undef */
const OFFLINE_PAGES = { en: '/en/offline', ar: '/ar/offline' };
const RESTORE_CACHE = 'koralink-offline-restore';
const RESTORE_KEY = '/__kl/restore-url';

// Push metadata KV (P2-92, run #69): the push locale the hook last synced
// server-side, so pushsubscriptionchange can re-upsert with the RIGHT locale
// (localStorage does not exist inside a service worker — Cache-API KV is the
// established pattern here, cf. RESTORE_CACHE).
const PUSH_META_CACHE = 'koralink-push-meta';
const PUSH_LOCALE_KEY = '/__kl/push-locale';
// Run #70 (P2-93 follow-up): the page hook also mirrors its API base (the
// fetcher's NEXT_PUBLIC_API_URL, path included) and the public VAPID key it
// used, so rotation re-points the new subscription WHERE THE PAGE talks to
// the API — not wherever this worker happens to be scoped. On Vercel prod
// the PWA and API are CROSS-ORIGIN (no rewrite proxies /api/*), so the old
// hardcoded relative path resolved against the PWA origin and 404'd
// silently — exactly the failure rotation handling exists to prevent.
const PUSH_API_BASE_KEY = '/__kl/push-api-base';
const PUSH_VAPID_KEY = '/__kl/push-vapid';
// Public VAPID key — same value the hook uses (public by design). Kept as
// the fallback: a rotation that fires before ANY page subscribe still has
// the deployed key.
const VAPID_PUBLIC_KEY =
  'BEl62iUYgU4x0mQDmvYFz9xSYmIqtrmHQ0IKcJqH2m5RjNK0QPlZcR-JxpjMQm4oBmSmmCm8FzWcMjQBjNt2jJc';
// Same-origin fallback used only when the hook has never written the KV
// (no subscribe has happened yet → nothing to re-point anyway).
const DEFAULT_API_BASE = '/api/v1';

function pushVapidKeyToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open('koralink-offline-pages')
      .then((cache) => cache.addAll(Object.values(OFFLINE_PAGES)))
      .catch(() => undefined),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const locale = url.pathname.split('/')[1];
  if (locale !== 'en' && locale !== 'ar') return;

  const isNavigation = req.mode === 'navigate' || req.destination === 'document';
  if (!isNavigation) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(req);
        if (response && response.ok && response.type === 'basic') {
          // A successful navigation clears the restore entry (fire-and-
          // forget: KV cleanup must never block respondWith).
          caches
            .open(RESTORE_CACHE)
            .then((cache) => cache.delete(RESTORE_KEY))
            .catch(() => undefined);
        }
        return response;
      } catch (err) {
        // Save the failed navigation BEFORE serving the offline page so the
        // user gets a way back once connectivity returns. Shape {u, t} is
        // pinned by src/lib/sw-offline-restore.ts + test/lib/sw-offline-restore.test.ts.
        try {
          const cache = await caches.open(RESTORE_CACHE);
          await cache.put(
            RESTORE_KEY,
            new Response(JSON.stringify({ u: req.url, t: Date.now() }), {
              headers: { 'content-type': 'application/json' },
            }),
          );
        } catch {
          // KV failure must never break the offline fallback itself.
        }

        const page = OFFLINE_PAGES[locale];
        const cached = await caches.match(page);
        if (cached) return cached;
        // P2-80 hardening (run #64): a cache miss (install-time addAll
        // failed) no longer yields Response.error() — redirect to the
        // offline page so the browser fetches it live; if that also fails,
        // the generic workbox document fallback (next.config.mjs
        // fallbacks.document) still applies. The address bar keeps the
        // original deep link up to the redirect (respondWith semantics).
        return Response.redirect(page, 302);
      }
    })(),
  );
});

// P2-92 (run #69): browsers rotate web-push subscriptions (FCM pushes
// `pushsubscriptionchange` at any time — sometimes years later, sometimes
// seconds after grant). Without this handler the OLD endpoint dies while the
// server keeps its row: the user silently stops receiving match/cancel
// pushes until the 90-day stale sweep, with the profile toggle showing ON.
// On rotation: re-subscribe locally (same VAPID key), re-upsert the new
// subscription to /notifications/subscribe with the locale the hook last
// synced (Cache-API KV), and update the KV marker on success. Any failure is
// silent-by-design in the worker context — the NEXT successful app open
// re-syncs via the hook's marker effect.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      let locale = 'ar';
      let apiBase = DEFAULT_API_BASE;
      let vapidKey = VAPID_PUBLIC_KEY;
      try {
        const cache = await caches.open(PUSH_META_CACHE);
        const cachedLocale = await cache.match(PUSH_LOCALE_KEY);
        if (cachedLocale) {
          const body = await cachedLocale.json();
          if (body && (body.l === 'en' || body.l === 'ar')) locale = body.l;
        }
        const cachedApiBase = await cache.match(PUSH_API_BASE_KEY);
        if (cachedApiBase) {
          const body = await cachedApiBase.json();
          if (body && typeof body.b === 'string' && body.b.length > 0) {
            apiBase = body.b;
          }
        }
        const cachedVapid = await cache.match(PUSH_VAPID_KEY);
        if (cachedVapid) {
          const body = await cachedVapid.json();
          if (body && typeof body.k === 'string' && body.k.length > 0) {
            vapidKey = body.k;
          }
        }
      } catch (_) {
        // missing/unreadable KV → Arabic-first default (P2-72 convention),
        // deployed VAPID key, same-origin API base.
      }

      let newSub = null;
      try {
        newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: pushVapidKeyToUint8Array(vapidKey),
        });
      } catch (_) {
        return; // permission lost or push unavailable — nothing to re-point
      }

      try {
        const res = await fetch(`${apiBase}/notifications/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...newSub.toJSON(), locale }),
        });
        if (res && res.ok) {
          const cache = await caches.open(PUSH_META_CACHE);
          await cache.put(
            PUSH_LOCALE_KEY,
            new Response(JSON.stringify({ l: locale }), {
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
      } catch (_) {
        // POST failed (offline / auth expired) — the browser keeps the new
        // local subscription; the hook re-syncs on the next app open.
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'KoraLink', body: event.data.text() };
  }

  const { title = 'KoraLink', body = '', data = {} } = payload;

  // Resolve the installed locale so the deep link preserves ar/en.
  // Server injects the subscriber's locale per-push (P1-5); payloads that
  // omit it fall back to AR (P2-72, run #57) — the product is Arabic-first,
  // so an unlabeled push renders Arabic copy/RTL and lands on /ar/… rather
  // than English.
  const locale = data.locale || 'ar';

  let url = '/';
  if (data.type === 'match-chat' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  else if (data.type === 'dm' && data.conversationId) url = `/${locale}/messages/${data.conversationId}`;
  else if (data.type === 'pom-decided' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  // Run #24 Reviewer-A: push types that carried routing data fell through to
  // '/' — the tap lost all context. Route the carriers to their match/report.
  else if (data.type === 'match-cancelled' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  else if (data.type === 'player-removed' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  else if (data.type === 'match-rescheduled' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  else if (data.type === 'report-resolved') url = `/${locale}/reports`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192-maskable.png',
      tag: data.type ? `${data.type}:${data.matchId ?? data.conversationId ?? ''}` : undefined,
      renotify: true,
      data: { ...data, url },
      // P2-8 (run #24): Arabic notifications render RTL, others auto.
      dir: locale === 'ar' ? 'rtl' : 'auto',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      // P2-93 (run #70): same-origin guard — a tampered/push-injected
      // notification payload must never send the user off-origin. Resolve
      // against the SW origin and require the result to stay on it.
      let url = '/';
      try {
        const resolved = new URL(rawUrl, self.location.origin);
        if (resolved.origin !== self.location.origin) return;
        url = resolved.pathname + resolved.search + resolved.hash;
      } catch (_) {
        return; // unparseable URL — nothing safe to open
      }

      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // P2-93 (run #70): a hard `client.navigate()` wipes the app's in-memory
      // state (Zustand store, React Query cache, chat drafts, scroll) — even
      // when the window was ALREADY on the target route. Instead:
      //   already there → focus only;
      //   elsewhere      → postMessage + focus, the page-side handler
      //                    (PushNavHandler) does a soft router.push();
      //   no window      → open the deep link fresh.
      for (const client of clientList) {
        if (!('focus' in client)) continue;
        let alreadyThere = false;
        try {
          const cur = new URL(client.url, self.location.origin);
          const target = new URL(url, self.location.origin);
          alreadyThere =
            cur.pathname === target.pathname &&
            cur.search === target.search;
        } catch (_) {
          alreadyThere = false;
        }
        if (alreadyThere) return client.focus();
        try {
          client.postMessage({ type: 'kl-push-nav', url });
        } catch (_) {
          // closed between matchAll and postMessage — fall through to focus
        }
        return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
