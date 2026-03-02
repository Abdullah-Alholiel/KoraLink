// @ts-check
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
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
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

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
              "script-src 'self' https://api.mapbox.com https://cdn.moyasar.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https://*.mapbox.com",
              "connect-src 'self' https://api.mapbox.com https://events.mapbox.com wss: ws:",
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

export default withPWA(nextConfig);
