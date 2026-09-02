# Run #27 — Gate 0 Retrospective (2026-09-02 15:22Z)

## Prior cycle (run #26) verification

Three commits landed; spot-check at file:line.

### bfd453b P0-7 dev-login admin bypass

- `apps/api/src/auth/auth.service.ts:234` — `signAsync(payload, { expiresIn: ... })` always passes an expiresIn (defense in depth) ✓
- `apps/api/src/auth/auth.controller.ts:120-124` — reads `DEV_LOGIN_ENABLED` flag, NOT a `NODE_ENV` string ✓
- `apps/player-pwa/src/components/auth/DevLoginBar.tsx` — `NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR` build flag ✓
- LIVE-confirmed by run #26: dev-login as admin on Tailscale deployment 403 instead of minting a 7-day Admin JWT.

### 9678790 P0-8 push-endpoint SSRF

- `apps/api/src/common/security/push-endpoint.validator.ts` — new file with the validator
- `apps/api/src/modules/notifications/notifications.controller.ts` (subscribe) — calls `assertSafePushEndpoint` ✓
- `apps/api/src/modules/notifications/notifications.service.ts:233` (send path, defense-in-depth) — calls `assertSafePushEndpoint` ✓
- Reject ranges: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGN 100.64/10, IPv6 ULA fc/fd, link-local fe80, ::1 ✓
- LIVE-confirmed: `https://attacker.example/push` → 400 host-not-allowlist; `http://fcm...` → 400 must-https; `https://fcm...` → 201 ✓

### 835e27d P1-17a dep upgrades

- Root `package.json` `overrides`: ws ^8.21.0, engine.io ^6.6.7, Sentry trio pinned to 10.70.0 ✓
- `apps/api/package.json`: axios ^1.16.0 (was 1.7.4) ✓
- `apps/player-pwa/package.json` + `apps/admin/package.json`: next 15.5.21 (was 15.2.9) ✓
- `apps/api/package.json`: drizzle-orm STAYS at 0.44.7 (deferred) ✓
- 6 pre-existing tsc latent errors also fixed (disputes/reports/settlements/conversations/matches + 2 specs) ✓

**Run #26 verification: PASS** (all 3 commits land as-claimed).

## Self-review for run #27 (zai delegation 401'd, 4th consecutive run)

Pool state: `zai e954d6 ok`, `zai 140c3d ok` (both same key), `deepseek 402 exhausted`. Direct zai probe returns 200. Gateway daemon (PID 3537113, boot 2026-09-02T06:52:35Z) is STILL holding stale state. Per run #26 plan: parent self-review + opencode-go fallback. Neither opencode-go key nor deepseek budget available on this run → **self-review only**.

### P0-5 push / email / OTP scope (broadened by Abdullah 2026-09-02)

| Sub-item | Buildable? | Effort | Why / why not |
|----------|------------|--------|----------------|
| Per-category push preferences (notification_categories table + per-user prefs + UI) | YES, but big | ~3-4h | New table, new API endpoints, schema migration, profile UI, en/ar i18n. Needs full Gate 3 contract before Gate 4. Out of scope for run #27 budget; carry to run #28. |
| Install-triggered push enablement | YES | ~60-90 min | `InstallPrompt.tsx` exists; push permission is only requested on Profile (usePushNotifications). iOS needs install-first gating. Buildable but = one full slice; prefer to land with per-category prefs in #28 so we wire once. |
| Email-worthiness matrix + email infra | NO | ~6h+ | No email infra exists in the repo (no nodemailer, no SMTP, no Resend/SendGrid). Building email from scratch in a single cron slot is reckless. Carve out a separate P0 (P0-7?) for email infra. |
| Per-IP daily OTP cap (P2-19 residual) | YES | ~20 min | OtpStoreService already has per-phone daily cap (10). Just add per-IP counter to the same service. |

**Run #27 builds the small, ready items** and defers the larger ones to #28+:

### P1-17c — WS origin allowlist (Strix, run #25)

`apps/api/src/modules/gateway/app.gateway.ts:83-96` — the `isProd` gate allows unlisted origins in development. The auth still applies (good), but cookies travel on cross-origin connections because `credentials: true` is unconditional. Fix: drop the dev bypass, always disconnect on unlisted origin (a stricter, correct posture; same tightening as the prod branch).

### P1-17d — ICS calendar export TEXT escape (Strix LOW, CVSS ~3.5)

`apps/api/src/modules/matches/matches.controller.ts:98,101,102` — `match.title` (user input) is interpolated raw into SUMMARY. A `\r\n` in a title creates a second VEVENT with attacker-controlled summary + alarm. Fix: add `escapeIcsText()` helper, apply to title, location, description; regression spec.

### P2-19 — per-IP daily OTP cap (residual from #22)

`apps/api/src/modules/auth/auth.controller.ts:send-otp` — current `@Throttle({ default: { ttl: 60_000, limit: 3 } })` is per-minute. Need per-DAY per-IP. Use the same `OtpStoreService` cache layer (already Redis-backed in prod).

### P2-32 — foreign pitchId → 404 (decided 2026-09-02)

`apps/api/src/modules/partner/partner.service.ts:801-838` — currently silently ignores out-of-scope-but-valid pitchId (falls through to venue/no filter). Decision: return 404.

## ADMIN STATE CHECK (mandatory before any admin item)

- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → (none) — clean
- `git log --oneline -5 -- apps/admin` → last commit = `bfd453b` (P0-7 build-exclude for DevLoginBar)
- `systemctl --user is-active koralink-admin.service` → active
- Run #27 items touch `apps/api/src/modules/gateway` (P1-17c), `apps/api/src/modules/matches` (P1-17d), `apps/api/src/modules/auth` (P2-19), `apps/api/src/modules/partner` (P2-32). Only P2-32 is partner-area. Admin state clean → can proceed.

## Layer rotation (run #27 = `27 % 4 = 3` → DB & Infra per run #25 catch)

Sweep: schema/migration/indexes + service observability (Pino, Sentry) + systemd + service health. P1-17c is gateway (infra-adjacent), P1-17d is controller layer, P2-19 is auth layer, P2-32 is partner. None pure DB, but the run #25 directive says "infra" is the rotation focus this run; the items are infra-adjacent and Strix findings are infra-priority.

## Sentry / journal triage

- API: 5 issues in 24h. KORALINK-API-Y (1×, 2026-08-31) is the previously-refuted probe artifact (matches no shipped code). KORALINK-API-X (2×, 2026-08-30) is the transactions unique-violation race — fixed in P2-9 / P0-4 (in-tx onConflictDoNothing). KORALINK-API-W (1×, 2026-08-28) refuted. KORALINK-API-4 (117×) is the legitimate `Invalid or missing session cookie` — expected probe noise. KORALINK-API-B (80×) is a HeadlessChrome prober hitting `127.0.0.1:3000` — external scanner, not actionable.
- PWA: 5 issues. KORALINK-WEB-2 (`Failed to register a ServiceWorker: scriptURL ('http://localhost:3000/sw.js') violates CSP`) — 2× in 2026-08-20. CSP `script-src` includes 'self' but not localhost:3000 in a way that allows registration. Runbook fix: next.config.mjs `serviceWorker` registration options. Minor; not in this run's scope.
- Journal: 0 errors in the 5h window. Clean.

## Recommendation → Gate 1 (build small, save big for #28)

P1-17c, P1-17d, P2-19, P2-32 — all buildable, all small, all infra-adjacent. Defer P0-5 per-category prefs to #28 (clean cycle with install-triggered push enablement). Defer email infra entirely (separate P0+ cycle).
