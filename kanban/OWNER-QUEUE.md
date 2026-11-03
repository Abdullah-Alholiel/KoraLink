# KoraLink Owner Decision Queue

## Snapshot
- Open PRs: 1 (#178 promote staging→main)
- Commits ahead of main: 368 (last promote 2026-09-25)
- Pending migrations for next promote: 0055, 0056, 0057, 0058
- Services: API/PWA/Admin UP; Kong DOWN
- Neon quota storm: RESOLVED (0/48h) — promote #178 no longer quota-blocked.

## Active owner actions

### 1. Promote PR #178 merge + deploy (owner-only)
- **What:** Merge the staging→main promote PR, then run Neon migrations BEFORE Render deploy.
- **Click path:** GitHub → KoraLink PR #178 → Squash merge → console.neon.tech → `solitary-thunder-20087776` → run `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs` → Render dashboard → manual deploy.
- **Deadline:** No hard deadline, but the runbook says merge only after Neon migrations.

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
- **P1-52 (Neon quota):** RESOLVED run #183 — 0 events/48h, promote #178 unblocked.
