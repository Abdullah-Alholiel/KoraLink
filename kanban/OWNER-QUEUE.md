# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 1 (#178 promote staging→main — run-#187 PRs #214/#215 SQUASH-MERGED `3e51f85`/`d4aaaab` 2026-11-05 02:0xZ)
- Commits ahead of main: **382** (last promote 2026-09-25; runs #186–#187 added 4 squash commits, NO migrations)
- Pending migrations for next promote: **0045_user_blocks → 0058_venue_reviews_hidden_at** (14 migrations — ALL already applied to prod Neon with owner go, 60/60 verified; runs #186–#187 added NO migrations)
- Migration-chain CI: **8/8 passed** (journal + snapshot specs green)
- Services: API/PWA/Admin UP (on run-#187 squashes `3e51f85` API / `d4aaaab` PWA); Kong DOWN (not koralink)
- Factory loop status: **HEALTHY 2026-11-05** — run #187 shipped PR #214 (P2-308 audit-list throttle + DTO enum/id hardening) and PR #215 (P2-307 venue-picker error state); run-#186 claims live-verified (audit-logs 200/36 rows, review-report 404/400 paths); Sentry clean; Strix not due (done 2026-11-03, next window Dec 1–3).

## Active owner actions

### 1. Promote PR #178 merge (owner-only, remaining step)
- **Status (2026-11-03):** prod Neon healthy and **fully migrated — 60/60 journal rows (0045–0058 applied + object-verified)**. Earlier "empty prod" alarm = probe of the wrong project (PG18 experiment, now renamed locally). NOTHING blocks the merge technically.
- **Your one click:** GitHub → PR #178 → Squash merge → auto-deploys Render + Vercel ×2. Then `/api/v1/health` 200.
- **Optional hardening:** Render dashboard → koralink-api → Settings → Pre-Deploy Command `node scripts/migrate-vps.mjs` (closes P2-51 drift permanently).
- **Neon housekeeping (optional, 10 min):** check koralink-prod Usage/plan; delete `koralink-prod-pg18-empty` experiment. ~~download a backup~~ → DONE 2026-11-03/04: nightly prod dumps LIVE (koralink-backup-prod.timer 03:20 UTC, 30-day retention) + watchdog freshness alarm covers prod (P2-303, PR #210).

### 2. P2-285 — settlements void/cancel policy
- **What:** Should duplicate/erroneous settlement rows be voidable? If yes: void-while-pending-only? Audit trail? Never-after-paid?
- **Close line:** "P2-285: void pending settlements only with audit trail" OR "P2-285: never void, fix by adjustment row" OR "P2-285: defer".
- **Deadline:** Before building any settlement cancellation feature.

### 3. P0-2 sandbox → live Moyasar
- **What:** Flip `WALLET_TOPUP_ENABLED=true` + real Moyasar sandbox keys on staging; run one SAR 5.00 top-up with test card 4201320111111010.
- **Close line:** "P0-2 sandbox tested" OR "P0-2: flip WALLET_TOPUP_ENABLED and test".
- **Deadline:** Before prod launch; optional for staging now.

### 4. P1-41 email live
- **What:** Provision Resend API key + `MAIL_FROM` in API env to enable transactional email transport.
- **Close line:** "Email live: RESEND_API_KEY set".
- **Deadline:** Before prod launch.

### 5. P1-45 admin push composer
- **What:** Who may broadcast maintenance/venue-closure notices? Admin only? Partners to their venue rosters? What guardrails?
- **Close line:** "P1-45: admin-only broadcast" OR "P1-45: admin + venue owner scoped".
- **Deadline:** Not urgent.

### 6. P2-297 — hidden review rating policy
- **What:** When a venue review is hidden/restored/deleted, should `venues.rating_avg`/`rating_count` be recomputed? Does hiding remove it from the public average?
- **Close line:** "P2-297: hidden reviews do NOT count" OR "P2-297: hidden reviews still count".
- **Deadline:** Before building rating-recompute slice.

### 7. P1-69 player wallet withdrawal
- **What:** Withdrawal rail (bank transfer? wallet-to-wallet? instant SAR?); KYC threshold; fees.
- **Close line:** "P1-69: bank-transfer withdrawal with IBAN" OR "P1-69: defer until post-launch".
- **Deadline:** Before building withdrawal path.

### 8. P1-73 — dev-login on staging
- **What:** Should `DEV_LOGIN_ENABLED` stay `true` on staging? Factory recommends `false` (only real OTP) unless explicit staging-only dev-login policy.
- **Close line:** "P1-73: disable dev-login on staging" OR "P1-73: keep dev-login on staging".
- **Deadline:** Before public launch.

### 9. Recurring-match series identity (run #121)
- **What:** Confirm 8 weekly instances are independent matches (no series id); cancelled week does not propagate.
- **Close line:** "Confirmed: recurring matches are independent".
- **Deadline:** Before building any recurring-match editing/cancellation logic.

## Closed since last run
- **P1-52 (Neon quota):** RESOLVED 2026-11-03 — direct prod Neon connect OK, no quota error.
