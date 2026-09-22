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
// Public VAPID key — same value the hook uses (public by design).
const VAPID_PUBLIC_KEY =
  'BEl62iUYgU4x0mQDmvYFz9xSYmIqtrmHQ0IKcJqH2m5RjNK0QPlZcR-JxpjMQm4oBmSmmCm8FzWcMjQBjNt2jJc';
// API base for the subscribe re-upsert. Same-origin paths work as-is; the
// deploy tops expose the API on the same host (:8443/:3001 behind the TLS
// proxy), so a relative /api/v1 route is correct everywhere the app runs.
const API_SUBSCRIBE_URL = '/api/v1/notifications/subscribe';

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
      try {
        const cache = await caches.open(PUSH_META_CACHE);
        const cached = await cache.match(PUSH_LOCALE_KEY);
        if (cached) {
          const body = await cached.json();
          if (body && (body.l === 'en' || body.l === 'ar')) locale = body.l;
        }
      } catch (_) {
        // missing/unreadable KV → Arabic-first default (P2-72 convention)
      }

      let newSub = null;
      try {
        newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: pushVapidKeyToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (_) {
        return; // permission lost or push unavailable — nothing to re-point
      }

      try {
        const res = await fetch(API_SUBSCRIBE_URL, {
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
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an existing PWA window and navigate it to the deep link.
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
