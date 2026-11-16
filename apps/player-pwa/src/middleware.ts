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
    // `vendor/` (self-hosted third-party assets, e.g. the Moyasar payment form): without this
    // next-intl 307s /vendor/moyasar/moyasar.umd.js → /ar/vendor/... → 404 and the top-up form
    // cannot load its script or stylesheet at all (found on staging 2026-11-13, PR #250).
    '/((?!api|_next/static|_next/image|favicon.ico|manifest(?:\\..+)?\\.json|sw\\.js|workbox-.*|worker-.*|fallback-.*|landing|vendor/|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
};
