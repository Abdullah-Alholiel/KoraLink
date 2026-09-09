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
    '/((?!api|_next/static|_next/image|favicon.ico|manifest(?:\\..+)?\\.json|sw\\.js|workbox-.*|worker-.*|fallback-.*|landing|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
};
