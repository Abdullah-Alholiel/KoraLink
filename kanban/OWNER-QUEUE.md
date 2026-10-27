# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #170, 2026-10-27 16:3xZ)

Snapshot: open PRs = 2 (#178 promote owner-gated + #186 P1-38 venue photos, factory-merge-gated) · services API/PWA/Admin all active · staging @ 556a243 · P1-52 Neon quota still the top blocker · promote gate GREEN again (fonts-fetch flake cured this run).

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon quota exhausted (BLOCKS: promote PR #178 AND Neon applies for 0055+0056+0057)
- Sentry: **49 quota events/24h** (15:0xZ Oct 27; creeping ~+1/run, 15th consecutive watch). NEW this run: the prod push-subscription sweep (1F) is proven to be the SAME quota error — the limit now silently disables prod stale-push cleanup.
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or wait for the monthly reset window. Project birthday Oct-25 — the free reset may already be due; one console visit answers it.
- **Close-line:** "Neon quota cleared" (then factory applies 0055+0056+0057 to Neon and #178 becomes mergeable).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge)
- **Gate GREEN again** (this run cured a `next/font` fonts-fetch flake with empty-commit retrigger 556a243). ~330 commits ahead of main.
- **Migrations now riding it: 0055 (users.locale) + 0056 (wallet_topup_intents) + 0057 (venues.images, NEW run #170).** Sequence when P1-52 clears: (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs` (from a network that can reach api.neon.tech, or the container route); (2) merge staging into #178 or merge #178 after staging so all three ride it; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
- **Close-line:** "Merged #178 + Render deployed".

## 🟡 Owner actions (not blocking the factory)

### 3. P0-2 sandbox happy-path (post-promote, staging-first)
- Moyasar wallet top-up is BUILT and LIVE (PR #185, run #169) with the flag OFF. To exercise the real 3DS happy path: flip `WALLET_TOPUP_ENABLED=true` + MOYASAR_*_TEST keys on the API env (staging first), restart, then run one SAR 5.00 top-up with mada test card **4201320111111010** from a real browser (VPS is headless — 3DS frictionless leg can't be done here).
- **Close-line:** "Topup flag flipped + test top-up done".

### 4. Resend transactional-email keys (P1-41 ledger row — unlocks the run-#165 email lane)
- Partner email lane BUILT and LIVE log-only (PR #179 f1385a2); run #168 locale-aware email (PR #183) rides the same transport.
- **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env (dashboard.render.com → koralink-api → Environment). Owner-only per DECISIONS.md (email keys).
- **Close-line:** "RESEND keys added on Render".

### 5. Moyasar live-secret regeneration (pre-go-live only)
- Sandbox keys staged and working; ⚠️ the LIVE secret transited chat once — regenerate in the Moyasar dashboard before go-live. Not needed for sandbox.
- **Close-line:** "Moyasar live secret regenerated".

## ✅ Closed since last update (no action left)
- **Ghost Vercel kora-link check (P2-208): owner fix CONFIRMED holding** — PR #186's first head shows "Skipped - Not affected" instead of the old "Deployment was blocked"; no more escape-merge coin flips needed.
- **P1-69 dispute origination: PR #180 MERGED 2026-10-26** (verified this run); offline guard from run #168 already on staging.
- **P2-264 recipient-locale email — BUILT run #168** (PR #183 ac7f933, live-probed): rides the promote (see #2 sequence).
