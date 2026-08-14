// @ts-check
import withPWAInit from '@ducanh2912/next-pwa';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: false,
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [
      {
        // Match feed API: StaleWhileRevalidate, 60s TTL.
        // Intentionally mirrors React Query's staleTime (60s):
        //   - Service worker serves cached response instantly (offline resilience)
        //     while always revalidating in the background.
        //   - React Query's in-memory cache prevents redundant component-level
        //     re-fetches within the same 60-second window.
        // The two layers are complementary: Workbox handles network/offline,
        // React Query handles in-memory de-duplication across components.
        urlPattern: /^https?:\/\/.*\/api\/matches(\/.*)?$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'matches-feed-cache',
          expiration: {
            maxAgeSeconds: 60,
            maxEntries: 50,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        // Static assets: CacheFirst for performance
        urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            maxEntries: 100,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        // Payment endpoints: NetworkOnly – never cache financial requests
        urlPattern: /^https?:\/\/.*\/(api\/payments|moyasar)(\/.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        // Auth endpoints: NetworkOnly – never cache authentication
        urlPattern: /^https?:\/\/.*\/api\/auth(\/.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        // Wallet / transactions: NetworkOnly – financial data
        urlPattern: /^https?:\/\/.*\/api\/wallet(\/.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        // Clubs / venues API: StaleWhileRevalidate for offline browsing
        urlPattern: /^https?:\/\/.*\/api\/(clubs|venues)(\/.*)?$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'clubs-venues-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
            maxEntries: 30,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        // User profile API: NetworkFirst with short cache fallback
        urlPattern: /^https?:\/\/.*\/api\/user(\/.*)?$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'user-profile-cache',
          expiration: {
            maxAgeSeconds: 60 * 5, // 5 minutes
            maxEntries: 5,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          networkTimeoutSeconds: 3,
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@sentry/nextjs',
    '@sentry/node',
    '@sentry/core',
    '@opentelemetry/api',
    '@opentelemetry/core',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/instrumentation',
  ],


  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com https://cdn.moyasar.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https://*.mapbox.com",
              "connect-src 'self' https://api.mapbox.com https://events.mapbox.com http://localhost:* http://127.0.0.1:* http://100.93.99.24:* http://*.ts.net:* wss: ws:",
              "worker-src blob:",
              "font-src 'self' data:",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

const isDev = process.env.NODE_ENV === 'development';
const finalConfig = isDev ? nextConfig : withPWA(nextConfig);

export default withNextIntl(finalConfig);
