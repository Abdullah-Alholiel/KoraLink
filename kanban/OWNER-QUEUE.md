# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #168, 2026-10-27)

Snapshot: open PRs = 1 (the promote PR #178, owner-gated) · services API/PWA/Admin all active · staging @ c5a85c3 · P1-52 Neon quota still the top blocker.

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon quota exhausted (BLOCKS: promote PR #178 AND the new migration 0055's Neon apply)
- Sentry shows 46 quota events/24h (01:20Z Oct 27; creeping +1-2/run). Direct Neon probes rejected with the quota error.
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or wait for the monthly reset window. **Project birthday was Oct-25 — the free reset may already be due; one console visit answers it.**
- **Close-line:** "Neon quota cleared" (then factory applies 0055 to Neon and you can merge #178).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge)
- 324 commits ahead of main · all 11 checks green · MERGEABLE · assembled run #165, conflict-repaired run #166.
- **Sequence when P1-52 clears:** (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs` (from a network that can reach api.neon.tech, or the container route); **0055_users_locale is NEW since #178 was assembled — rebase/merge staging into the PR branch or merge staging after so 0055 rides it**; (2) you merge #178; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
- **Close-line:** "Merged #178 + Render deployed".

## 🟡 Owner actions (not blocking the factory)

### 3. Resend transactional-email keys (P1-41 ledger row — unlocks the run-#165 email lane)
- Partner email lane is BUILT and LIVE in log-only mode (PR #179 f1385a2): payout-request receipts + venue-owner cancellation emails. Run #168's locale-aware email (PR #183) rides the same transport — without keys every send logs-and-skips.
- **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env (dashboard.render.com → koralink-api → Environment).
- Owner-only per DECISIONS.md (email keys). **Close-line:** "RESEND keys added on Render".

### 4. Moyasar live-secret regeneration (pre-go-live only)
- Sandbox keys staged and working (.deploy-tokens); wallet top-up slice queued (pick-order 4).
- ⚠️ The LIVE secret transited chat once — regenerate in the Moyasar dashboard before go-live. Not needed for the sandbox slice.
- **Close-line:** "Moyasar live secret regenerated".

## ✅ Closed since last update (no action left)
- **P2-264 recipient-locale email — BUILT run #168** (PR #183 ac7f933, live-probed): users.locale column + per-recipient mailer resolution + PATCH /users/me + LanguageToggle sync. Migration 0055 on staging; rides the promote (see #2 sequence).
- **P2-263 dispute offline guard — BUILT run #168** (PR #184 c5a85c3, live): offline note + disabled submit before the tap; EN+AR.
- **P2-216/209/221 settlement money-path — VERIFIED merged** (PR #176 124f37a, Oct 25; live-probed run #168).
- **P2-208 ghost Vercel project — holding** (owner disconnected Oct 25; run #168's two new PRs carried zero ghost checks — first-try green, no escapes needed).
- P2-47(b) restore-on-behalf — BUILT run #167 (PR #181, live-probed).
- P2-258 push opt-in — BUILT run #167 (PR #182, live).
- P2-259 bell realtime — closed verified-no-build (already socket-driven).
- P2-51 Render migrate hook — closed lean (paid-only confirmed; migrate-first runbook standing).
- P0-2 PSP — Moyasar sandbox keys staged; wallet slice queued (pick-order 4).
- P1-38+P2-50 storage — SeaweedFS S3 LIVE on the VPS; StorageModule slice queued (pick-order 5).
- P1-69 dispute origination — BUILT run #166 (PR #180, live).

## 🟢 Factory lanes queued (no owner input needed)
1. **Moyasar wallet top-up slice** (pick-order 4 — sandbox keys staged, strategy + contract docs verified).
2. **StorageModule slice** (pick-order 5 — SeaweedFS S3 live on the VPS, plan doc ready).
3. P1-69 follow-up: signup-time locale capture (out of P2-264's scope by design; auth-DTO touch — small).
4. P2-260 wallet offline-vs-failed copy (pairs with the error-classify pass when wallet files next change).
