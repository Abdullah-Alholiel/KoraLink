import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

export const config = {
  matcher: [
    // PWA static artifacts MUST bypass locale routing: next-intl would 307
    // /manifest.ar.json → /en/manifest.ar.json → 404, and Workbox then fails
    // its precache install (bad-precaching-response) for EVERY returning user.
    // vendor/ (P0-2, 2026-11-13): same trap — the Moyasar form script
    // /vendor/moyasar/moyasar.umd.js was 307'd → /ar/vendor/… → 404, so the
    // top-up card form never rendered after the self-hosting switch.
    '/((?!api|vendor|_next/static|_next/image|favicon.ico|manifest(?:\\..+)?\\.json|sw\\.js|workbox-.*|worker-.*|fallback-.*|landing|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
};
