# Gate 2 — Architecture: Production-Grade PWA Hardening

## Slices (vertical, each shippable independently)

| Slice | Covers | Depends on |
|-------|--------|-----------|
| **A — TLS / secure context** | Reverse proxy + TLS, DNS, env `APP_URL`/`PLAYER_URL` to https, verify push+share+cookies | — (infra) |
| **B — API observability** | `@sentry/node`, global exception filter, requestId middleware, secret redaction | A (so DSN reachable) |
| **C — PWA server+client observability + CSP** | `instrumentation.ts`, `withSentryConfig`, `sentry.*.config`, env CSP, `error.tsx`→`captureError`, `global-error.tsx` | A, B |
| **D — OTP abuse protection** | per-phone cooldown/cap/lockout in `otp-store` (Redis) | B (observability to watch it) |
| **E — API test suite** | jest tests for auth/matches/wallet/potm mutation contract | — |
| **F — Offline + push i18n** | `fallbacks` wiring, push locale `dir`/locale resolve | A |
| **G — Secrets fail-fast** | zod config validation in API bootstrap | — |
| **H — Readiness + backups** | `/health/ready`, pg_dump cron + restore runbook | A |
| **I — e2e smoke tests** | Playwright, core flows in CI | A, E |
| **J — iOS install UX + polish** | install prompts, manifest `id`+`screenshots`, dead deps, not-found locale | A |

## Slice A — TLS (architecture)

**Recommendation: Cloudflare Tunnel** (unless Abdullah prefers VPS-native Caddy).

```
[phone] ──HTTPS──▶ app.koralink.sa ──▶ Cloudflare Tunnel ──▶ VPS:3000 (PWA standalone)
[phone] ──HTTPS──▶ api.koralink.sa ──▶ Cloudflare Tunnel ──▶ VPS:3001 (NestJS)
```

- No ports opened; Cloudflare terminates TLS; free managed certs.
- `NEXT_PUBLIC_API_URL=https://api.koralink.sa/api/v1`, `NEXT_PUBLIC_APP_URL=https://app.koralink.sa`.
- API `PLAYER_URL=https://app.koralink.sa` (CORS allowlist + cookie origin).
- Verify: push arrives on phone, `navigator.share` present, cookie has `Secure`, Lighthouse PWA passes.

## Slice B — API observability (data flow)

```
unhandled exception → @Catch() ExceptionFilter
   ├─ Sentry.captureException(err) { extra: { requestId, userId, path } }
   └─ (rethrow) → Pino error log { requestId }
every request → requestId middleware → AsyncLocalStorage → available in filter + logs
```

**Files:** `main.ts` (Sentry.init + requestId mw + global filter), `common/interceptors/sentry.interceptor.ts`
(new — AGENTS.md already references it), `common/filters/all-exceptions.filter.ts` (new),
`common/middleware/request-id.middleware.ts` (new). `@sentry/node` dep.

## Slice C — PWA observability + CSP

```
instrumentation.ts → Sentry.init (server)   [register once]
sentry.client.config.ts → browser init + replay
sentry.server.config.ts → server init
withSentryConfig(nextConfig) → source maps upload (release = git sha)
error.tsx → captureError(error)  (was console.error)
global-error.tsx (NEW) → captureError + reset UI
next.config headers() → CSP connect-src from env: api + mapbox + moyasar + *.ingest.sentry.io + *.posthog.com
```

**Files:** `instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`,
`src/app/global-error.tsx`, `src/app/[locale]/error.tsx` (edit), `next.config.mjs` (edit),
`env.mjs` (add `NEXT_PUBLIC_SENTRY_ORG/PROJECT`).

## Slice D — OTP abuse protection

`OtpStoreService` (Redis) gains three keys per phone: `otp:{phone}` (code),
`otp:cooldown:{phone}` (resend lock, TTL 60s), `otp:fails:{phone}` (counter, TTL 15min).
`sendOtp` → 429 if cooldown active or daily SMS count ≥ cap (cap key `otp:day:{phone}` TTL 24h).
`verifyOtp` → 429 if `fails ≥ 5`; increments on mismatch, resets on success.

## Slice E — API test suite

Jest unit/integration with a mocked DB (`DB_CONNECTION` provider overridden) or testcontainers.
Cover: `auth` (OTP flow, lockout), `matches` (join/leave/start/complete/cancel all return
`findOne` shape — assert relations present), `wallet` (cancel refund == `pitch_cost_sar`),
`potm` (vote window, single recognition). See Gate 3 for exact assertions.

## Slice F — Offline + push i18n

- `next.config.mjs`: replace `fallbacks: false` with a localized fallback (see open question #3).
- `worker/index.js`: resolve locale from `event.data.locale` (or a `default_locale` subscription
  payload) instead of hardcoded `'en'`; set `dir: locale==='ar' ? 'rtl' : 'ltr'`.

## Slice G — Secrets fail-fast

`ConfigModule.forRoot({ validationSchema })` (zod or `Joi`-style) — assert `JWT_SECRET`,
`COOKIE_SECRET`, `DATABASE_URL` non-empty; remove `'fallback-dev-secret'`/`'change-me'` defaults
in prod; throw at boot if `NODE_ENV=production` and any secret is default.

## Slice H — Readiness + backups

- `health.controller.ts`: add `GET /health/ready` → `SELECT 1` + `redis.ping()`, 503 on failure.
- `scripts/backup-pg.sh`: `pg_dump koralink | gzip` to timestamped file; systemd timer or cron;
  retention 7 days; `docs/runbooks/restore.md`.

## Slice I — e2e smoke tests

Playwright against a staging deploy (or local): auth (dev-login/OTP), join match, cast POTM vote,
share-copy cascade. Wire into CI as a new job (only on `main` merge to keep CI fast).

## Slice J — iOS install UX + polish

`InstallPrompt` client component (`beforeinstallprompt` capture on Android; iOS "Share → Add to
Home Screen" banner), manifest `id` + `screenshots`, prune dead deps, `not-found.tsx` locale.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| TLS change breaks the Tailscale-only workflow Abdullah uses daily | Keep Tailscale IP reachable; add HTTPS on top, don't remove HTTP until verified |
| `Secure` cookie + HTTP = broken login during transition | Ship `secure` flag flip only **after** HTTPS is live (Slice A) |
| Sentry captures PII (phones) | `beforeSend` redaction: strip `phone`, `access_token`, cookies |
| OTP lockout locks out a legit user | 15-min window (not permanent); clear on successful verify; log + Sentry breadcrumb |
| e2e adds CI time/flakiness | Run on main merge only; retry x2; scope to smoke paths |
