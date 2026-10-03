// @ts-check
import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the workspace root explicitly: npm workspaces + a worktree checkout
  // (node_modules symlinked from the main tree) otherwise lets Next's
  // multi-lockfile inference pick the wrong root mid-build and webpack fails
  // resolving next/dist/pages internals. In the main tree this equals the
  // inferred value (no behaviour change); in worktrees it pins semantics.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
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
      // doop design-sync: POSTs DOM captures to the internal design canvas
      'https://aa.tail2948f9.ts.net:9460',
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://aa.tail2948f9.ts.net:9460",
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
