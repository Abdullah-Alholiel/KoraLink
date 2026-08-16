// @ts-check
import withPWAInit from '@ducanh2912/next-pwa';
import { withSentryConfig } from '@sentry/nextjs';
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    let apiOrigin = 'http://localhost:3001';
    try {
      apiOrigin = new URL(apiUrl).origin;
    } catch {
      // keep the localhost fallback
    }
    const connectSrc = [
      "'self'",
      'https://api.mapbox.com',
      'https://events.mapbox.com',
      'https://*.ingest.sentry.io',
      'https://*.ingest.de.sentry.io',
      'https://app.posthog.com',
      'https://*.posthog.com',
      apiOrigin,
      'ws:',
      'wss:',
    ].join(' ');

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
              `connect-src ${connectSrc}`,
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

// Sentry must be the outermost wrapper so its webpack instrumentation covers
// server components, Route Handlers, and edge. Source-map upload is opt-in:
// only enabled when ALL of SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are
// present — a partial config (token without org/project) would hard-fail the
// build inside sentry-cli, so we gate on the complete trio.
export default withSentryConfig(withNextIntl(finalConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  sourcemaps: {
    disable: !(
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT
    ),
  },
});
