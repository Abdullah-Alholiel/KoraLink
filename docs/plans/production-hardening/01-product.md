# Gate 1 — Product Spec: Production-Grade PWA Hardening

## Problem statement

KoraLink works, but it is not yet production-grade. Three structural gaps mean every new
platform bug is discovered by Abdullah on his iPhone **after** shipping, and every backend
failure is invisible: (1) no HTTPS/secure context, (2) observability wired only on the client
(and blocked by CSP), (3) no API/e2e test net. This cycle closes those gaps so the app can
survive real users.

## User stories (prioritized)

### P0 — must ship for "production grade"

- **P0-1 (TLS):** As a user, I access KoraLink over HTTPS so Web Push works, the share sheet /
  copy-to-clipboard work natively, install works, and my session cookie is never sent insecurely.
  *Success:* `https://app.koralink.sa` + `https://api.koralink.sa` resolve and serve with a valid
  cert; PWA installs on Android/iOS; push notification arrives on a phone.
- **P0-2 (Observability):** As a developer, every unhandled API/SSR/client error is captured in
  Sentry with user + requestId context, and Pino logs carry a requestId I can correlate.
  *Success:* throw in any layer → Sentry event appears; Pino line carries `requestId`.
- **P0-3 (API tests):** As a developer, the mutation-return contract (`findOne`, not bare rows)
  and money math (cancel refund = `pitch_cost_sar`) are protected by automated tests.
  *Success:* `npm test` in `apps/api` runs a real suite; a regression fails it.
- **P0-4 (OTP abuse):** As a user, my phone can't be used for SMS pumping or OTP brute-force.
  *Success:* resend cooldown + daily cap + verify-attempt lockout enforced per phone (Redis).

### P1 — important, ship next

- **P1-5 (Offline):** As a user, when I'm offline I see the localized offline page, not a blank error.
- **P1-6 (Push i18n):** As an Arabic user, push notifications render RTL and deep-link to `/ar/…`.
- **P1-7 (CSP):** CSP is env-driven (prod domain + Sentry/PostHog hosts), not hardcoded Tailscale IPs.
- **P1-8 (Secrets):** As a developer, the API fails fast on missing secrets instead of silently
  using `fallback-dev-secret` / `change-me`.
- **P1-9 (Backups):** Postgres has a scheduled dump with retention + a documented restore runbook.
- **P1-10 (Readiness):** `GET /health/ready` verifies DB+Redis so deploys/uptime checks are honest.
- **P1-11 (Session):** (Deferred decision — see open questions) token revocation strategy.
- **P1-12 (e2e):** Core flows (auth → join → vote → share) are smoke-tested in CI.

### P2 — polish

- **P2-13:** iOS "Add to Home Screen" guidance; Android `beforeinstallprompt`.
- **P2-14:** manifest `id` + `screenshots`.
- **P2-15:** prune dead deps (`@nestjs/bull`+`bull`, unused `@opentelemetry/*` config, decide Dockerfile fate).
- **P2-16:** `not-found.tsx` respects locale; move inline i18n maps to `messages/*.json`.

## Scope boundaries

**IN SCOPE:** TLS + reverse proxy, Sentry (API/server/client) + Pino correlation, CSP env-driven,
OTP abuse protection, API test suite, offline fallback, push i18n, secrets fail-fast, readiness
probe, DB backup cron, e2e smoke tests.

**OUT OF SCOPE (this cycle):** refresh-token rotation / logout revocation (needs product decision —
see open questions), push permission UX redesign, image CDN, multi-region/HA, horizontal feature work.

## Success criteria (measurable)

1. `https://app.koralink.sa` installs as a PWA; push notification delivered to a real device.
2. A forced exception in API + SSR + client each produce a Sentry event with `requestId`.
3. `apps/api` `npm test` has a non-zero, meaningful suite that exercises the mutation contract.
4. `send-otp` returns 429 after N resends within the cooldown; `verify-otp` locks after M failures.
5. `npx vitest run` (PWA) + `npm test` (API) + `turbo run build` all green in CI.

## Open questions (for Gate 2 / Abdullah)

1. **TLS approach:** Cloudflare Tunnel (zero open ports, free TLS) vs. Caddy/Nginx on the VPS +
   Let's Encrypt vs. Tailscale Funnel. *Recommendation: Cloudflare Tunnel for `*.koralink.sa`.*
2. **Session:** keep 7d JWT (accept the risk) vs. shorten to 24h + silent refresh vs. add a
   server-side session/revocation store. *Recommendation: shorten to 24h + silent refresh as a
   fast follow; do not build revocation this cycle.*
3. **Offline fallback locale:** Workbox fallback is a single URL; localized `/ar/offline` vs
   `/en/offline` needs either a locale-neutral fallback or SW-side redirect.
4. **Backup cadence:** daily pg_dump with 7-day retention + weekly offsite copy?
