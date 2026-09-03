# Run #28 — Push categories + install-triggered push enablement (Gate 0)

**Cycle window**: 2026-09-03 (cron run #28, ~01:18Z start)
**Scope chosen for one cron slot**: tight sub-slice of P0-5 — **schema + API + minimal profile UI for per-category mutes**, plus **install-triggered push enablement** (iOS A2HS gate).
**Rationale**: full P0-5 (8 categories, migration, API, full UI, i18n, observability) is a 3-sub-cycle effort. P0-9 email infra and the full install prompt flow are bigger standalone cycles. This run ships a *vertical slice* the user can feel: 4 mute toggles in profile + iOS PWA install before push is offered.

## What's already done (verified, do not re-litigate)
- P1-20: `users.push_muted` + `quiet_hours_*` (PATCH `/users/me/push-preferences`, run #13, schema.ts + users.service.ts:306).
- P1-5: per-subscription locale for deep-links + push text (push-text.ts, run #24).
- P2-27: POTM pushes route through `sendPushToUsers` (run #17).
- P0-8: `assertSafePushEndpoint` SSRF guard at subscribe + send (run #26, push-endpoint.validator.ts).
- P0-7: dev-login gated by `DEV_LOGIN_ENABLED` flag, JWT always has `expiresIn` (run #26, bfd453b).
- Push triggers surfaced today: `match_starting_soon` · `match_cancelled` · `match_rescheduled` · `POTM` (via sendPomDecided → sendPushToUsers) · `report_resolved`/`report_dismissed` · `match_cancelled_admin` · `account_suspended` · DM messages (conversations.service.ts:310 → sendPushToUsers).

## Run #27 re-verification (claims vs. file:line)
- **P1-17c** PASS — app.gateway.ts:80-97 (no `isProd` gate, ALWAYS reject unlisted origins).
- **P1-17d** PASS — common/security/ics-text.ts exports `escapeIcsText`; controller applies to title/location/description; real `•` char in DESCRIPTION.
- **P2-19** PASS — otp-store.service.ts has `OTP_DAILY_IP_CAP=50`, `keys.ip_day`, `getIpDailyCount`, `incrementIpDaily`; auth.service.ts:58 `sendOtp(phone, ip?)`; auth.controller.ts:57 `@Req() req: Request`, `:62` extracts IP, `:63` threads to service.
- **P2-32** PASS — partner.service.ts:860-869 `if (q.pitchId && !pitchIds.includes(q.pitchId)) throw new NotFoundException('Pitch not in your scope.')` BEFORE the existing query.

## Standing bug-class sweep (parent self-review, 2026-09-03)
- `eq(.*, null)` in prod code: **CLEAN** (0 hits).
- `::uuid` raw casts: **CLEAN** (0 hits in prod).
- Bare `.returning()`: 10 hits, all in the same files as previous runs. P2-5 backlog, not blocking.

## Provider / quota state
- z.ai 5h: 14% · z.ai weekly: 1% (per directive) — well under 75% cap.
- z.ai direct probe: **HTTP 200 OK** this run.
- **zai children STILL 401 — 5th consecutive run (#24–#28)** at the gateway daemon (PID 3537113, booted 2026-09-02T06:52:35Z). Pool clean, direct probe 200, gateway resolving through stale state.
- Fallback chain: opencode-go (no key on VPS) → deepseek-v4-flash (HTTP 402 Insufficient Balance, just probed) → **parent self-review**. Re-investigation of the gateway daemon needed on a follow-up; not blocking this run.

## Decide: P0-5 sub-slice in budget
- **Schema**: 1 new table `user_notification_prefs(user_id, category, muted)` + 1 drizzle migration. ~30 min.
- **API**: extend `UpdatePushPreferencesDto` with `categoryMutes: { match?, chat?, promo?, system? }`; users.service.ts persists; notifications.service.ts:sendPushToUsers filters per category. ~45 min.
- **PWA UI**: 4 toggle rows in profile, locale-aware labels, en/ar i18n parity. ~45 min.
- **Install trigger**: in `usePushNotifications.subscribe`, gate `requestPermission()` on `display-mode: standalone` (iOS PWA install-first contract). ~15 min.
- Tests + build + commit. ~30 min.
- **Total: ~2.5h**. Fits.

## Out of scope this run (parked)
- Full 8-category taxonomy (using 4: `match`/`chat`/`promo`/`system`; `promo` reserved for future use, no triggers today).
- Email infrastructure (P0-9) — needs owner call.
- ddl.P0-6 PDPL delete/export.
- drizzle 0.45.2.
- P2-29 host "+" CTA redesign.
- P1-19 phone-change, P1-20 partner onboarding (both need product decisions).

## Risk + mitigations
- **Migration lands in the live DB without a code consumer (run #1 trap)**: write the code FIRST, generate migration, build+test, commit both, THEN db:migrate + API restart in that order.
- **Existing `users.push_muted` semantics**: stays a global kill-switch. New per-category mutes are checked ONLY when `push_muted=false` (per-category opt-out within the active set). A muted user gets nothing; an unmuted user gets the intersection of (active categories) ∩ (not-muted categories).
- **Install gating on iOS**: iOS Safari only fires `beforeinstallprompt` via the manual Share → Add to Home Screen flow; the gate `display-mode: standalone` is the only reliable installed-state signal. Existing `usePwaInstall` already exposes this — `usePushNotifications` can read it.
