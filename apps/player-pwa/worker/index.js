// Custom service-worker extension for @ducanh2912/next-pwa.
// This file is prepended to the generated workbox sw.js — it adds Web Push
// handling (US10): background notifications for DMs, match chat, POTM.
// Deep-link routing: match-chat → /<locale>/match/<id>, dm → /<locale>/messages/<id>.

/* eslint-disable no-undef */
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
  const locale = 'en';

  let url = '/';
  if (data.type === 'match-chat' && data.matchId) url = `/${locale}/match/${data.matchId}`;
  else if (data.type === 'dm' && data.conversationId) url = `/${locale}/messages/${data.conversationId}`;
  else if (data.type === 'pom-decided' && data.matchId) url = `/${locale}/match/${data.matchId}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192-maskable.png',
      tag: data.type ? `${data.type}:${data.matchId ?? data.conversationId ?? ''}` : undefined,
      renotify: true,
      data: { ...data, url },
      dir: 'auto',
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
