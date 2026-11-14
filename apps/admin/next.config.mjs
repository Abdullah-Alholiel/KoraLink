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
    // CSP scheme matching has NO generic http→ws rule (only https→wss), so an
    // http API origin must list its ws:// form explicitly or Chrome silently
    // blocks the /lobby ops socket (t_8cdabf05 E2E: raw ws from the page was
    // refused while https deployments worked by the https→wss special case).
    const apiWsOrigin = apiOrigin.replace(/^http/, 'ws');
    const connectSrc = [
      "'self'",
      'https://*.ingest.sentry.io',
      'https://*.ingest.de.sentry.io',
      'https://app.posthog.com',
      'https://*.posthog.com',
      apiOrigin,
      apiWsOrigin,
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
              // The root layout loads Tajawal from Google Fonts (ar locale);
              // without these the stylesheet + font files are CSP-blocked.
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              `connect-src ${connectSrc}`,
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
