# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 1 (#178 promote staging→main — owner-only, checks GREEN + MERGEABLE CLEAN as of run #194; owner-deferred per D-20261106-02 Coolify cutover)
- Commits ahead of main: **414** (last promote 2026-09-25; **0059_settlement_void rides the next promote — applied to staging, NOT prod (prod Neon 60/60 rows re-verified live via Render env, run #196)**; migrate-first runbook mandatory before any merge)
- Services: API/PWA/Admin UP (API+PWA serving run #197 build `b805c97` — legacy dummy top-up route RETIRED end-to-end, live-probed 404; admin unchanged on 8b1655d)
- Factory loop status: **HEALTHY 2026-11-09** — run #197 shipped PR #232 (P2-331 money-security: Reviewer-A latent-CRITICAL retired; 4 PR-Agent rounds all real fixes; reconcile sweep ASC flip = P2-314 starvation half). Strix next window Dec 1–3.

## Active owner actions

### NEW-5. P2-332 — cancellation window + refund policy (NEW run #197)
- **What:** Players can cancel/leave a match up to any point with no cutoff and refunds are 100% (no fee tier). A booking product needs a cancel-by deadline driving refund eligibility. MONEY-ADJACENT → refund rules are owner-only per the Defaults register; the factory will NOT default-build this.
- **Your part:** Decide the policy shape: how many hours before slot-time the cancel window closes, the fee tier (full refund vs partial vs forfeit), and whether it's platform-wide or per-venue.
- **Close line:** "P2-332: window = Xh before slot, refund = <full/partial/forfeit>, scope = <platform/venue>" OR "P2-332: keep 100% refunds for now (accepted with dated note)".
- **Deadline:** Before paid matches go live at scale.

### NEW-1. P2-325 — Moyasar webhook registration (NEW run #196)
- **What:** Wallet top-up credit currently depends on the client verify call + the 5-min reconcile backstop (webhook-less flow, wallet.reconcile.service.ts:34). A player who pays then closes the app before verify waits for the cron rescue. Industry norm = signed webhook capture.
- **Your part:** Moyasar dashboard → register a webhook URL for invoice/payment events (the factory builds the signature-verify endpoint once the URL exists).
- **Close line:** "P2-325: webhook URL registered — build the verify endpoint" OR "P2-325: reconcile backstop is enough for now".
- **Deadline:** Before prod launch (money-adjacent).

### NEW-2. P2-327 — admin console MFA (NEW run #196, follows RBAC)
- **What:** The admin console (settlements void/pay, refunds, CSV exports) sits behind password-only auth; no 2FA anywhere. Per D-20261106-14 RBAC design comes first; MFA is the follows-item.
- **Close line:** "P2-327: plan MFA after RBAC" OR "P2-327: not needed (VPS-private console)".
- **Deadline:** Before staff accounts exist.

### NEW-3. P2-328 — promo/coupon system shape (NEW run #196, CEO-lane)
- **What:** No discount codes exist (grep 0 hits); competitors run first-game discounts heavily in KSA. Needs product shape: % vs flat, per-venue vs platform, stacking rules.
- **Close line:** "P2-328: build <shape>" OR "P2-328: defer post-launch".
- **Deadline:** None (acquisition lever, not a gap).

### NEW-4. P2-329 — player no-show fee policy (NEW run #196, CEO-lane)
- **What:** A player who no-shows a PAID match owes nothing (fee is refunded on cancel; karma penalties only). Host math goes negative with zero recourse. Needs your call: fee vs karma vs both.
- **Close line:** "P2-329: <fee/karma/both>" OR "P2-329: defer".
- **Deadline:** Before paid matches go live at scale.

### 1. P0-11 — Coolify cutover go/no-go (NEW run #190 — the plan is ready)
- **Owner decision (Life OS 2026-11-07, D-20261106-01):** Approve plan, start A2
- **What:** Move prod+staging onto this VPS via Coolify (PDPL residency). The full plan is at **docs/plans/prod-on-vps.md** — verified against live reality: Coolify 4.6.0 + Traefik proxy are ALREADY installed and healthy on this VPS; the three app Dockerfiles + standalone outputs exist; zero port conflicts; staging quartet stays untouched. Eight numbered approvals (A1 plan → A2 create apps+prod-DB → A3 webhook → A4 Neon→VPS DB move (owner-executed) → A5 sslip URLs → A6 public go-live → A7 offsite backup target → A8 retire Render/Vercel/Neon after 2 stable weeks). Prod DB = memory-capped container, credentials owner-held, factory never sees them. Launch gaps listed not built (Turnstile on OTP, PDPL notice, Moyasar/Unifonic callbacks, offsite backup NOT R2).
- **Close line:** "P0-11: plan approved, start A2" OR "P0-11: amend — <notes>" OR "P0-11: defer".
- **Deadline:** Owner-paced; nothing executes without your A1.

### 2. Promote PR #178 merge (owner-only, remaining step)
- **Owner decision (Life OS 2026-11-07, D-20261106-02):** Wait for Coolify cutover
- **Status (2026-11-06, run #191):** prod Neon healthy and **fully migrated — 60/60 journal rows (0045–0058 applied + object-verified)**. Checks now **11/11 GREEN** (gate, fresh-apply, semgrep, review, Dependency Audit, gitleaks, Vercel ×2 + previews). NOTHING blocks the merge technically; the promote now also carries the run-#191 dependency-security work (0 prod criticals).
- **Your one click:** GitHub → PR #178 → Squash merge → auto-deploys Render + Vercel ×2. Then `/api/v1/health` 200.
- **Optional hardening:** Render dashboard → koralink-api → Settings → Pre-Deploy Command `node scripts/migrate-vps.mjs` (closes P2-51 drift permanently).
- **Neon housekeeping (optional, 10 min):** check koralink-prod Usage/plan; delete `koralink-prod-pg18-empty` experiment. ~~download a backup~~ → DONE 2026-11-03/04: nightly prod dumps LIVE (koralink-backup-prod.timer 03:20 UTC, 30-day retention) + watchdog freshness alarm covers prod (P2-303, PR #210).

### 3. P2-285 — settlements void/cancel policy
- **Owner decision (Life OS 2026-11-07, D-20261106-03):** Void pending only, with audit trail
- **What:** Should duplicate/erroneous settlement rows be voidable? If yes: void-while-pending-only? Audit trail? Never-after-paid?
- **Close line:** "P2-285: void pending settlements only with audit trail" OR "P2-285: never void, fix by adjustment row" OR "P2-285: defer".
- **Deadline:** Before building any settlement cancellation feature.

### 4. P0-2 sandbox → live Moyasar
- **Owner decision (Life OS 2026-11-07, D-20261106-04):** Flip WALLET_TOPUP_ENABLED and test
- **What:** Flip `WALLET_TOPUP_ENABLED=true` + real Moyasar sandbox keys on staging; run one SAR 5.00 top-up with test card 4201320111111010.
- **Close line:** "P0-2 sandbox tested" OR "P0-2: flip WALLET_TOPUP_ENABLED and test".
- **Deadline:** Before prod launch; optional for staging now.

### 5. P1-41 email live
- **Owner decision (Life OS 2026-11-07, D-20261106-05):** Defer to pre-launch — And i think its already set but we can check pre pandh
- **What:** Provision Resend API key + `MAIL_FROM` in API env to enable transactional email transport.
- **Close line:** "Email live: RESEND_API_KEY set".
- **Deadline:** Before prod launch.

### 6. P1-45 admin push composer
- **Owner decision (Life OS 2026-11-07, D-20261106-06):** Admin plus venue-owner scoped
- **What:** Who may broadcast maintenance/venue-closure notices? Admin only? Partners to their venue rosters? What guardrails?
- **Close line:** "P1-45: admin-only broadcast" OR "P1-45: admin + venue owner scoped".
- **Deadline:** Not urgent.

### 7. P2-297 — hidden review rating policy
- **Owner decision (Life OS 2026-11-07, D-20261106-07):** Hidden reviews still count
- **What:** When a venue review is hidden/restored/deleted, should `venues.rating_avg`/`rating_count` be recomputed? Does hiding remove it from the public average?
- **Close line:** "P2-297: hidden reviews do NOT count" OR "P2-297: hidden reviews still count".
- **Deadline:** Before building rating-recompute slice.

### 8. P1-69 player wallet withdrawal
- **Owner decision (Life OS 2026-11-08, D-20261106-08):** Defer until post-launch — Back in the wallet not to their bank.
- **What:** Withdrawal rail (bank transfer? wallet-to-wallet? instant SAR?); KYC threshold; fees.
- **Close line:** "P1-69: bank-transfer withdrawal with IBAN" OR "P1-69: defer until post-launch".
- **Deadline:** Before building withdrawal path.

### 9. P1-73 — dev-login on staging (factory re-assessed run #193)
- **Owner decision (Life OS 2026-11-07, D-20261106-09):** Keep dev-login on staging
- **What:** Factory VERIFIED dev-login 403s in prod and assessed staging-on usage as deliberate owner workflow → reclassified ACCEPTED-RISK on the board (run #193). Owner confirmation still welcome.
- **Close line:** "P1-73: keep dev-login on staging" (confirms the accepted-risk) OR "P1-73: disable dev-login on staging".
- **Deadline:** Before public launch.
- **What:** Should `DEV_LOGIN_ENABLED` stay `true` on staging? Factory recommends `false` (only real OTP) unless explicit staging-only dev-login policy.
- **Close line:** "P1-73: disable dev-login on staging" OR "P1-73: keep dev-login on staging".
- **Deadline:** Before public launch.

### 11. P1-72 staging posture — one env change (NEW run #188)
- **Owner decision (Life OS 2026-11-07, D-20261106-10):** Apply posture
- **What:** The explicit flags are MERGED but unset (zero change by design). To close the Strix MEDIUM on staging: add to `apps/api/.env` → `COOKIE_SECURE=true` + `SWAGGER_ENABLED=false`, then `systemctl --user restart koralink-api.service`. Verify: dev-login response cookie shows `Secure`, `GET /api/docs` → 404. (Only if staging TLS is confirmed end-to-end on every access path.)
- **Close line:** "P1-72: staging posture applied" OR "P1-72: keep unset for now".
- **Deadline:** Before public launch.

### 10. Recurring-match series identity (run #121)
- **What:** Confirm 8 weekly instances are independent matches (no series id); cancelled week does not propagate.
- **Close line:** "Confirmed: recurring matches are independent".
- **Deadline:** Before building any recurring-match editing/cancellation logic.

### 12. P1-76 — social sign-in (Apple/Google) (NEW run #189)
- **Owner decision (Life OS 2026-11-07, D-20261106-12):** Build Apple first post-launch
- **What:** Do we add Apple/Google sign-in? iOS App Store REQUIRES Sign in with Apple once any third-party login exists; Saudi market expects low-friction signup vs OTP. Priority vs other auth work?
- **Close line:** "P1-76: build Apple first post-launch" OR "P1-76: defer, OTP is fine for now" OR "P1-76: plan a Gate cycle".
- **Deadline:** Before iOS App Store submission.

### 13. P2-311 — receipt/invoice artifact shape (NEW run #189, folds into P2-145)
- **Owner decision (Life OS 2026-11-07, D-20261106-13):** In-app receipt MVP — And can be exported as invoice
- **What:** Players top up + hosts pay pitch costs with no printable artifact (CSV export only). What shape: in-app receipt page? PDF invoice w/ VAT? Defer ZATCA e-invoicing?
- **Close line:** "P2-311: in-app receipt MVP" OR "P2-311: PDF invoice w/ VAT" OR "P2-311: defer".
- **Deadline:** Not urgent; before formal B2B venue contracts.

## Owner decisions from Life OS

- **Owner decision (Life OS 2026-11-07, D-20261106-14):** Design RBAC before adding staff roles
- **Owner decision (Life OS 2026-11-07, D-20261106-15):** Generate and set VAPID keys
- **Owner decision (Life OS 2026-11-08, D-20261106-11):** Confirmed: independent — Review and assess situation fully and re assess recomended decision depending on my app !

## Closed since last run
- **P1-52 (Neon quota):** RESOLVED 2026-11-03 — direct prod Neon connect OK, no quota error.
