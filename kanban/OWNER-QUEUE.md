# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 1 (#178 promote staging→main — owner-only, checks 11/11 GREEN as of run #191)
- Commits ahead of main: **395** (last promote 2026-09-25; NO new migrations this cycle)
- Pending migrations for next promote: **0045_user_blocks → 0058_venue_reviews_hidden_at** (14 migrations — ALL already applied to prod Neon with owner go, 60/60 verified; runs #186–#191 added NO migrations)
- Migration-chain CI: **8/8 passed** (journal + snapshot specs green)
- Services: API/PWA/Admin UP (serving run #191 build e660313 — next 15.5.29, @sentry/nextjs 10.78.0); Kong DOWN (not koralink)
- Factory loop status: **HEALTHY 2026-11-06** — run #191 shipped PR #220 (dependency security: ALL prod criticals killed, audit parent-verified 0×4 trees) + PR #221 (P2-312 waitlist position chip on cards, live E2E via reversible tracer); both merged + deployed to the VPS quartet. New: P2-315 (SW match-detail cache staleness), P2-316 (majors register). Strix November scan DONE 2026-11-03 — next window Dec 1–3.

## Active owner actions

### 1. P0-11 — Coolify cutover go/no-go (NEW run #190 — the plan is ready)
- **What:** Move prod+staging onto this VPS via Coolify (PDPL residency). The full plan is at **docs/plans/prod-on-vps.md** — verified against live reality: Coolify 4.6.0 + Traefik proxy are ALREADY installed and healthy on this VPS; the three app Dockerfiles + standalone outputs exist; zero port conflicts; staging quartet stays untouched. Eight numbered approvals (A1 plan → A2 create apps+prod-DB → A3 webhook → A4 Neon→VPS DB move (owner-executed) → A5 sslip URLs → A6 public go-live → A7 offsite backup target → A8 retire Render/Vercel/Neon after 2 stable weeks). Prod DB = memory-capped container, credentials owner-held, factory never sees them. Launch gaps listed not built (Turnstile on OTP, PDPL notice, Moyasar/Unifonic callbacks, offsite backup NOT R2).
- **Close line:** "P0-11: plan approved, start A2" OR "P0-11: amend — <notes>" OR "P0-11: defer".
- **Deadline:** Owner-paced; nothing executes without your A1.

### 2. Promote PR #178 merge (owner-only, remaining step)
- **Status (2026-11-06, run #191):** prod Neon healthy and **fully migrated — 60/60 journal rows (0045–0058 applied + object-verified)**. Checks now **11/11 GREEN** (gate, fresh-apply, semgrep, review, Dependency Audit, gitleaks, Vercel ×2 + previews). NOTHING blocks the merge technically; the promote now also carries the run-#191 dependency-security work (0 prod criticals).
- **Your one click:** GitHub → PR #178 → Squash merge → auto-deploys Render + Vercel ×2. Then `/api/v1/health` 200.
- **Optional hardening:** Render dashboard → koralink-api → Settings → Pre-Deploy Command `node scripts/migrate-vps.mjs` (closes P2-51 drift permanently).
- **Neon housekeeping (optional, 10 min):** check koralink-prod Usage/plan; delete `koralink-prod-pg18-empty` experiment. ~~download a backup~~ → DONE 2026-11-03/04: nightly prod dumps LIVE (koralink-backup-prod.timer 03:20 UTC, 30-day retention) + watchdog freshness alarm covers prod (P2-303, PR #210).

### 3. P2-285 — settlements void/cancel policy
- **What:** Should duplicate/erroneous settlement rows be voidable? If yes: void-while-pending-only? Audit trail? Never-after-paid?
- **Close line:** "P2-285: void pending settlements only with audit trail" OR "P2-285: never void, fix by adjustment row" OR "P2-285: defer".
- **Deadline:** Before building any settlement cancellation feature.

### 4. P0-2 sandbox → live Moyasar
- **What:** Flip `WALLET_TOPUP_ENABLED=true` + real Moyasar sandbox keys on staging; run one SAR 5.00 top-up with test card 4201320111111010.
- **Close line:** "P0-2 sandbox tested" OR "P0-2: flip WALLET_TOPUP_ENABLED and test".
- **Deadline:** Before prod launch; optional for staging now.

### 5. P1-41 email live
- **What:** Provision Resend API key + `MAIL_FROM` in API env to enable transactional email transport.
- **Close line:** "Email live: RESEND_API_KEY set".
- **Deadline:** Before prod launch.

### 6. P1-45 admin push composer
- **What:** Who may broadcast maintenance/venue-closure notices? Admin only? Partners to their venue rosters? What guardrails?
- **Close line:** "P1-45: admin-only broadcast" OR "P1-45: admin + venue owner scoped".
- **Deadline:** Not urgent.

### 7. P2-297 — hidden review rating policy
- **What:** When a venue review is hidden/restored/deleted, should `venues.rating_avg`/`rating_count` be recomputed? Does hiding remove it from the public average?
- **Close line:** "P2-297: hidden reviews do NOT count" OR "P2-297: hidden reviews still count".
- **Deadline:** Before building rating-recompute slice.

### 8. P1-69 player wallet withdrawal
- **What:** Withdrawal rail (bank transfer? wallet-to-wallet? instant SAR?); KYC threshold; fees.
- **Close line:** "P1-69: bank-transfer withdrawal with IBAN" OR "P1-69: defer until post-launch".
- **Deadline:** Before building withdrawal path.

### 9. P1-73 — dev-login on staging
- **What:** Should `DEV_LOGIN_ENABLED` stay `true` on staging? Factory recommends `false` (only real OTP) unless explicit staging-only dev-login policy.
- **Close line:** "P1-73: disable dev-login on staging" OR "P1-73: keep dev-login on staging".
- **Deadline:** Before public launch.

### 11. P1-72 staging posture — one env change (NEW run #188)
- **What:** The explicit flags are MERGED but unset (zero change by design). To close the Strix MEDIUM on staging: add to `apps/api/.env` → `COOKIE_SECURE=true` + `SWAGGER_ENABLED=false`, then `systemctl --user restart koralink-api.service`. Verify: dev-login response cookie shows `Secure`, `GET /api/docs` → 404. (Only if staging TLS is confirmed end-to-end on every access path.)
- **Close line:** "P1-72: staging posture applied" OR "P1-72: keep unset for now".
- **Deadline:** Before public launch.

### 10. Recurring-match series identity (run #121)
- **What:** Confirm 8 weekly instances are independent matches (no series id); cancelled week does not propagate.
- **Close line:** "Confirmed: recurring matches are independent".
- **Deadline:** Before building any recurring-match editing/cancellation logic.

### 12. P1-76 — social sign-in (Apple/Google) (NEW run #189)
- **What:** Do we add Apple/Google sign-in? iOS App Store REQUIRES Sign in with Apple once any third-party login exists; Saudi market expects low-friction signup vs OTP. Priority vs other auth work?
- **Close line:** "P1-76: build Apple first post-launch" OR "P1-76: defer, OTP is fine for now" OR "P1-76: plan a Gate cycle".
- **Deadline:** Before iOS App Store submission.

### 13. P2-311 — receipt/invoice artifact shape (NEW run #189, folds into P2-145)
- **What:** Players top up + hosts pay pitch costs with no printable artifact (CSV export only). What shape: in-app receipt page? PDF invoice w/ VAT? Defer ZATCA e-invoicing?
- **Close line:** "P2-311: in-app receipt MVP" OR "P2-311: PDF invoice w/ VAT" OR "P2-311: defer".
- **Deadline:** Not urgent; before formal B2B venue contracts.

## Closed since last run
- **P1-52 (Neon quota):** RESOLVED 2026-11-03 — direct prod Neon connect OK, no quota error.
