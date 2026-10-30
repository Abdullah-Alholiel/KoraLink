# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #175, 2026-10-29 12:1xZ)

Snapshot: open PRs = **1** (#178 promote, owner-gated) · services API/PWA/Admin all active · staging @ `5280efc` (PRs #194+#195 merged + LIVE) · **P1-52 Neon quota 59 events/24h — AT the 60 flag-line, owner billing** · shipped run #176: fetcher Bearer origin allowlist (P2-278) + wallet last-top-up-attempt card (P2-279, unconfirmed attempts no longer invisible).

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon quota (BLOCKS: promote PR #178 AND Neon applies for 0055+0056+0057)
- Sentry: **59 quota events/24h (re-pull 15:5xZ Oct 29, run #176; +1 since run #175 — AT the 60 flag-line; 21st consecutive watch run). The prod push-subscription sweep (1F, 11/24h) is the SAME quota error — the limit silently disables prod stale-push cleanup.**
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or wait for the monthly reset. Project birthday Oct-25 — the free reset may already be due; one console visit answers it.
- **Close-line:** "Neon quota cleared" (then the factory applies 0055+0056+0057 to Neon and #178 becomes mergeable).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge)
- Gate GREEN, ~343 commits ahead of main. **Migrations riding it: 0055 (users.locale) + 0056 (wallet_topup_intents) + 0057 (venues.images).**
- Sequence when P1-52 clears: (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs`; (2) YOU merge #178; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
- **Close-line:** "Merged #178 + Render deployed".

## 🟡 Owner actions (not blocking the factory)

### 3. P0-2 sandbox happy-path (post-promote, staging-first)
- Moyasar wallet top-up is BUILT and LIVE (flag OFF). This run also made the failure copy money-truthful: a charged-but-declined payment now says the bank will auto-refund it, instead of claiming "no money was taken" (P2-276). To exercise the real 3DS happy path: flip `WALLET_TOPUP_ENABLED=true` + MOYASAR_*_TEST keys on the API env (staging first), restart, then run one SAR 5.00 top-up with mada test card **4201320111111010** from a real browser.
- **Close-line:** "Topup flag flipped + test top-up done".

### 4. Resend transactional-email keys (P1-41 — unlocks the run-#165 email lane)
- Partner email lane BUILT and LIVE log-only. **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env. Owner-only per DECISIONS.md.
- **Close-line:** "RESEND keys added on Render".

### 5. Moyasar live-secret regeneration (pre-go-live only)
- The LIVE secret transited chat once — regenerate in the Moyasar dashboard before go-live. Not needed for sandbox.
- **Close-line:** "Moyasar live secret regenerated".

### 6. NEW (run #175 finding — product call, NOT buildable without you): player wallet withdrawal path
- Reviewer B P1: players can top up and receive refunds as wallet balance, but there is NO way to withdraw — every credited SAR is locked in-app. For a KSA booking product this is go-live-blocker-class (consumer expectation). Building it needs your product call (payout rail via Moyasar Transfers? bank IBAN payout? minimum balance?) before any Gate cycle.
- **Close-line:** one line naming the rail (e.g. "withdrawals = Moyasar transfers to card, min SAR 50") and the factory opens the Gate cycle.

## 🟢 Optional

### 7. Try the venue-photo pipeline yourself (staging, no factory needed)
- Admin console → Venues → edit any venue → Add photos (≤6, JPG/PNG/WebP ≤5MB) → Save → open the clubs page / venue detail in the PWA.
