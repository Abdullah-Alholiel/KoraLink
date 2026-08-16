# Gate 0 — Retrospective: Production-Grade PWA Audit

## Commit pattern

Last 40 commits: **17 feat · 16 fix · 7 docs** → fix:feat = **0.94:1** (numerically < 1.5:1).

Qualitative signal is worse than the number: a large share of the `fix` commits are **reactive
iOS platform fixes** (`2d41528` 100dvh nav, `ee85572` sheet stabilization, `3da3cdd`/`76ab9cd`
portaled sheets, `f22886c` iOS date/time pickers, `2c3062f` drag-to-dismiss). Pattern = platform
bugs are discovered on Abdullah's iPhone **after shipping**, then patched one at a time. Root
cause is the absence of three feedback loops:

1. **No error visibility** — client `error.tsx` uses `console.error` (not Sentry); API has no
   Sentry at all. Users hit white screens / silent 500s that the team never sees.
2. **No secure context** — the whole stack runs over **HTTP** on Tailscale, so Web Push, native
   `navigator.share`/`clipboard`, and Lighthouse installability are all structurally dead. The
   share-copy bug just fixed (`81a8d22`) is a direct symptom.
3. **No e2e tests** — the iOS flows that keep breaking (auth, join, vote, share) have zero
   automated coverage; only Vitest unit tests run in CI.

## Audit findings (evidence-backed)

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| 1 | No HTTPS/TLS (HTTP on Tailscale) | CRITICAL | `http://100.93.99.24:3000/3001`; CI already references `https://api.koralink.sa`/`app.koralink.sa` |
| 2 | Observability half-wired: no API/server Sentry, no CSP allow, no requestId | CRITICAL | `app.module.ts` has no Sentry; `next.config.mjs` lists `@sentry/*` in `serverExternalPackages` but no `withSentryConfig`/`instrumentation.ts`; CSP `connect-src` missing Sentry/PostHog hosts; AGENTS.md §4 references `common/interceptors/sentry.interceptor.ts` which **does not exist** |
| 3 | Zero API tests | CRITICAL | `jest` in `api/package.json`; `search: *.spec.ts` → 0 files |
| 4 | OTP brute-force / SMS pumping | CRITICAL | `auth.service.ts` `sendOtp`/`verifyOtp` have no cooldown/lockout/cap; only global 60/min per-IP throttler |
| 5 | Offline page dead | IMPORTANT | `[locale]/offline.tsx` exists but `next.config.mjs` sets `fallbacks: false` |
| 6 | Push locale hardcoded `en` + `dir:'auto'` | IMPORTANT | `worker/index.js:19` |
| 7 | CSP hardcoded to Tailscale IPs | IMPORTANT | `connect-src` has `http://100.93.99.24:* http://*.ts.net:*` |
| 8 | Insecure secret fallbacks | IMPORTANT | `JWT_SECRET`→`'fallback-dev-secret'`, `COOKIE_SECRET`→`'change-me'` |
| 9 | No DB backups / DR | IMPORTANT | no pg_dump cron, no restore runbook |
| 10 | Health check liveness-only | IMPORTANT | `health.controller.ts` returns `{status, timestamp}` only |
| 11 | 7d JWT, no refresh/revocation | IMPORTANT | `JWT_EXPIRY` default `'7d'`; logout client-side only |
| 12 | No e2e tests (Playwright/Cypress) | IMPORTANT | no `playwright.config`/`cypress.config` |
| 13 | No iOS install guidance / manifest `id`+`screenshots` | MINOR | manifest.json; no `beforeinstallprompt` handling |
| 14 | Dead deps + dual deploy path | MINOR | `@nestjs/bull`+`bull` unused; `Dockerfile` exists but deploy is systemd+standalone |
| 15 | `not-found.tsx` hardcodes `ar`; error/not-found use inline i18n | MINOR | `not-found.tsx` `locale='ar'` |

## What is NOT broken (already solid — do not redo)

- Client-side Sentry+PostHog **init + instrumentation** (`ObservabilityProvider` wired in
  `layout.tsx`; `trackEvent`/`captureError`/`identifyUser` used across ~8 files).
- API security middleware: helmet, strict CORS allowlist, `ValidationPipe` (whitelist+forbid),
  `ThrottlerModule` (60/min), HttpOnly+Secure+SameSite cookie flags (correct when `NODE_ENV=production`).
- Pino structured logging (JSON in prod) wired via `nestjs-pino`.
- SW runtime caching strategy (feed SWR, auth/payment/wallet NetworkOnly) is well-designed.
- dev-login is correctly blocked in prod (`ForbiddenException`).

## Recommendation

**Proceed to Gate 1.** This is a hardening cycle, not a rewrite — the app logic is in good shape;
the gaps are concentrated in infra (TLS), observability wiring, and the missing test/security net.
