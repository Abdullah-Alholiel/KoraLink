// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

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
      'https://*.ingest.sentry.io',
      'https://*.ingest.de.sentry.io',
      'https://app.posthog.com',
      'https://*.posthog.com',
      apiOrigin,
    ].join(' ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              `connect-src ${connectSrc}`,
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

// Sentry must be the outermost wrapper so its webpack instrumentation covers
// server components, Route Handlers, and edge. Source-map upload is opt-in,
// gated on the complete SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT trio.
export default withSentryConfig(nextConfig, {
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
