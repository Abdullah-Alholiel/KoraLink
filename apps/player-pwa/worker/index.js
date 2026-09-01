// Custom service-worker extension for @ducanh2912/next-pwa.
// This file is prepended to the generated workbox sw.js — it adds Web Push
// handling (US10): background notifications for DMs, match chat, POTM.
// Deep-link routing: match-chat → /<locale>/match/<id>, dm → /<locale>/messages/<id>.

// Offline navigation fallback (P2-40, run #23): workbox's document fallback
// (`fallbacks.document: '/ar/offline'`) only fires via handlerDidError on the
// routes registered in next.config.mjs — the start-url "/" and API/asset
// subresources. An offline navigation to an inner page (/en/play, /ar/clubs)
// matches NO route, so users got the browser's dinosaur error page. Worse, the
// only fallback document is /ar/offline, so EN users landed on Arabic copy.
// Fix: warm BOTH locale offline pages at install, then intercept document
// navigations under /en/* and /ar/* ourselves — network first (so online
// behavior is unchanged), and on network failure serve the locale-matching
// offline page from the cache. The offline page itself re-detects locale from
// the pathname, so copy always matches the user's locale.

/* eslint-disable no-undef */
const OFFLINE_PAGES = { en: '/en/offline', ar: '/ar/offline' };

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
        return await fetch(req);
      } catch (err) {
        const page = OFFLINE_PAGES[locale];
        return (await caches.match(page)) || Response.error();
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
  // Server injects the subscriber's locale per-push (P1-5); fall back to en.
  const locale = data.locale || 'en';

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
