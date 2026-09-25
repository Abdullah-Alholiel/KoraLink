// @ts-check
import withPWAInit from '@ducanh2912/next-pwa';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withPWA = withPWAInit({
  dest: 'public',
  // P2-60 (run #50): registration is owned by ServiceWorkerUpdater so a
  // failed register() is captured (scope swRegister) instead of surfacing as
  // an unhandled rejection from this injected script (Sentry WEB-2 — old
  // browsers / enterprise CSPs blocking the worker).
  register: false,
  disable: process.env.NODE_ENV === 'development',
  // Offline fallback: serve /ar/offline when a start-url or cached-asset request
  // fails (both cache and network). NOTE (P2-40, run #23): this config-level
  // document fallback only fires via handlerDidError on routes registered BELOW
  // — an offline navigation to an inner page matches no route and used to hit
  // the browser error page (and EN users got Arabic copy). Document navigations
  // are now handled locale-aware in worker/index.js (warm-caches /en/offline +
  // /ar/offline, serves the matching one). This fallback stays for the
  // start-url "/" route, which has no locale segment to key on.
  fallbacks: {
    document: '/ar/offline',
  },
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [
      // NetworkOnly money/auth recipes are registered FIRST on purpose: workbox
      // matches routes in registration order, and the static-assets CacheFirst
      // recipe below would otherwise shadow them (e.g. the Moyasar SDK script
      // ends in .js and would be served from cache — never for payment code).
      {
        // Payment endpoints: NetworkOnly – never cache financial requests
        // (our /payments API + anything on a moyasar host — the SDK's own hosts).
        urlPattern: /^https?:\/\/[^/]*moyasar[^/]*\/|\/api\/v1\/payments(?:\/.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        // Auth endpoints: NetworkOnly – never cache authentication
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/auth(?:\/.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        // Wallet / transactions: NetworkOnly – financial data
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/wallet(?:\/.*)?$/,
        handler: 'NetworkOnly',
      },
      // P2-57 (run #51) — PATTERN REALITY FIX, applies to EVERY recipe below:
      // real API URLs are CROSS-ORIGIN `${host}/api/v1/...` (API global prefix
      // `api/v1`, apps/api/src/main.ts:118) and workbox RegExpRoute matches the
      // FULL href INCLUDING the query string (workbox-routing RegExpRoute:
      // `regex.exec(url.href)`, cross-origin patterns must match from index 0).
      // The old patterns (`^https?:\/\/.*\/api\/...`, no v1, `(...)?$` tail)
      // therefore matched NOTHING in any deployed environment — the whole API
      // caching table was inert (run #18's NetworkFirst flip, run #43's
      // opaque-response hardening and the clubs/venues SWR never engaged
      // offline). New rules: patterns are anchored `^scheme://host/api/v1/...`
      // with query-tolerant tails `(?:\?.*)?$`, and single-segment scoping
      // `[^/?#]+` so detail / feed / sub-resources route to the right recipe.
      {
        // Match DETAIL page: exactly one id segment after /matches/ — NetworkFirst
        // with a 1h offline fallback window, so a revisit of an already-seen match
        // renders last-good data instead of the offline banner (P2-57). Registered
        // BEFORE the feed recipe so the more specific route wins (workbox matches
        // in registration order). Chat messages / pom-result / actions are NOT
        // cached here (multi-segment paths fail the pattern; actions are POSTs and
        // bypass runtime caching anyway).
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/matches\/[^/?#]+(?:\?.*)?$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'match-detail-cache',
          networkTimeoutSeconds: 3,
          expiration: {
            maxAgeSeconds: 60 * 60, // 1h — last-good detail survives an offline revisit
            maxEntries: 30,
          },
          cacheableResponse: {
            // Run #43 rule: [200] only — never cache opaque (status 0) responses.
            statuses: [200],
          },
        },
      },
      {
        // Match feed API (collection ONLY — single segment after v1): NetworkFirst
        // (P2-28, run #18 — was StaleWhileRevalidate). SWR served the cached
        // response FIRST on every load, so players could see up to 60s-old
        // availability even on a perfect connection (React Query then marked it
        // fresh for its own 60s staleTime and never refetched). NetworkFirst
        // prefers fresh data; the cache is only the offline/slow-network fallback
        // (3s timeout). The query-tolerant tail is load-bearing: the feed always
        // carries ?lat=&lng= (geo) and venue-filter queries (?venue_id=).
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/matches(?:\?.*)?$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'matches-feed-cache',
          networkTimeoutSeconds: 3,
          expiration: {
            maxAgeSeconds: 60,
            maxEntries: 50,
          },
          cacheableResponse: {
            // Run #43: status 0 = opaque response — same-origin routes never
            // legitimately produce one, and caching it poisons the entry until
            // maxAge expiry (wrong feed/profile served offline). [200] only.
            statuses: [200],
          },
        },
      },
      {
        // Static assets: CacheFirst for performance (registered AFTER the
        // NetworkOnly money/auth trio — see the ordering note at the top).
        urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            maxEntries: 100,
          },
          cacheableResponse: {
            // Run #43: status 0 = opaque response — same-origin routes never
            // legitimately produce one, and caching it poisons the entry until
            // maxAge expiry (wrong feed/profile served offline). [200] only.
            statuses: [200],
          },
        },
      },
      {
        // Clubs / venues API: StaleWhileRevalidate for offline browsing
        // (collection + single-segment detail; sub-resources like availability
        // ride the match-feed recipe via ?venue_id=).
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/(?:clubs|venues)(?:\/[^/?#]+)?(?:\?.*)?$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'clubs-venues-cache',
          expiration: {
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
            maxEntries: 30,
          },
          cacheableResponse: {
            // Run #43: status 0 = opaque response — same-origin routes never
            // legitimately produce one, and caching it poisons the entry until
            // maxAge expiry (wrong feed/profile served offline). [200] only.
            statuses: [200],
          },
        },
      },
      {
        // User profile API (/users/me and its sub-resources — own data only):
        // NetworkFirst with a short 5-minute cache fallback.
        urlPattern: /^https?:\/\/[^/]+\/api\/v1\/users\/me(?:\/.*)?$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'user-profile-cache',
          expiration: {
            maxAgeSeconds: 60 * 5, // 5 minutes
            maxEntries: 5,
          },
          cacheableResponse: {
            // Run #43: status 0 = opaque response — same-origin routes never
            // legitimately produce one, and caching it poisons the entry until
            // maxAge expiry (wrong feed/profile served offline). [200] only.
            statuses: [200],
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


  // P2-42 (run #72): CSP script-src hardened for PROD — drops
  // 'unsafe-eval' (verified safe: zero `eval(` / `new Function(` in ALL
  // production client chunks — grep 2026-09-24, run-#72 report) and the
  // DEAD mapbox/moyasar script entries (zero mapbox/moyasar code or deps
  // in the PWA; evidence in docs/plans/run72-csp-hardening/).
  //
  // 'unsafe-inline' STAYS in prod script-src — hard evidence (live HTML,
  // 2026-09-24): the Next.js App Router response ships 17 inline <script>
  // tags (hydration/flight bootstrap `self.__next_f.push`), zero src, zero
  // nonce attributes. Removing the inline allowance without a working
  // per-request nonce pipeline blocks EVERY page's hydration (blank app).
  // That nonce pipeline was ATTEMPTED in run #72 and BLOCKED with evidence
  // — docs/plans/run72-csp-hardening/00-retro.md (edge-runtime node:crypto
  // 500s; render-path wedges under both documented Next 15 patterns;
  // agent-spawned standalone servers wedge renders even with the PRISTINE
  // middleware — environmental). Retry needs a dedicated cycle with an
  // upgrade-first plan. Tripwire: test/lib/csp-config.test.ts pins these
  // shapes — regenerate the test when you touch this block.
  //
  // Dev keeps the legacy permissive script-src: react-refresh/HMR evals.
  // Kept in prod script-src: https://*.posthog.com — posthog-js injects its
  // reverse-proxy bundle (exception-autocapture, surveys) as a <script>
  // from the -assets host; connect-src alone does NOT cover script loading
  // (blocked live in prod 2026-09-09:
  // us-assets.i.posthog.com/static/exception-autocapture.js). doop
  // design-sync loads the capture snippet from the internal design canvas
  // (owner tooling, deliberate addition a550815).
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    let apiOrigin = 'http://localhost:3001';
    try {
      apiOrigin = new URL(apiUrl).origin;
    } catch {
      // keep the localhost fallback
    }
    const scriptSrc = isDev
      ? [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://api.mapbox.com',
          'https://cdn.moyasar.com',
          'https://*.posthog.com',
          // doop design-sync: loads the capture snippet from the internal design canvas
          'https://aa.tail2948f9.ts.net:9460',
        ].join(' ')
      : [
          "'self'",
          // see block comment above: inline scripts are REQUIRED until the
          // nonce pipeline lands; eval is BANNED in prod (verified unused).
          "'unsafe-inline'",
          'https://*.posthog.com',
          // doop design-sync: loads the capture snippet from the internal design canvas
          'https://aa.tail2948f9.ts.net:9460',
        ].join(' ');
    const connectSrc = [
      "'self'",
      // P2-42 final (run #73): mapbox connect/style/img entries DROPPED — the
      // script-src cleanup (run #72) proved zero mapbox/moyasar code or deps
      // ship in the PWA, so no request these allowances enabled can occur.
      'https://*.ingest.sentry.io',
      'https://*.ingest.de.sentry.io',
      'https://app.posthog.com',
      'https://*.posthog.com',
      apiOrigin,
      // WS: prod allows ONLY wss: (cleartext ws: is dev-only — the API origin
      // is https in every deployed environment, so wss: covers it).
      ...(isDev ? ['ws:'] : []),
      'wss:',
      // doop design-sync: POSTs DOM captures to the internal design canvas
      'https://aa.tail2948f9.ts.net:9460',
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
              `script-src ${scriptSrc}`,
              // P2-42 final (run #73): style-src/img-src mapbox entries DROPPED
              // (dead — zero mapbox code/deps; evidence in the connectSrc block
              // comment above). inline styles stay (Tailwind runtime styles).
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              `connect-src ${connectSrc}`,
              "worker-src 'self' blob:",
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
