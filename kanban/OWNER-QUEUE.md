# Owner Action Queue — KoraLink

**Updated:** 2026-10-26 02:4xZ (run #165). The factory loop REGENERATES this file every
run. Close an item by pasting its close-line to the agent.

## Snapshot
- Open PRs: **2** — **#178 promote (staging→main, 312 commits)** · #179 merged this run (f1385a2 live on the VPS)
- Services: api/pwa/admin/storage all green · API health 200 · API error logs clean 5h
- **P1-52 RE-ARMED**: Neon prod is quota-blocked AGAIN (run-#165 direct probe 01:35Z Oct 26 rejected; 41 Sentry events/24h through 00:00Z Oct 26). The Oct-25 "self-resolved" read was premature.

## 🔴 Blocking actions (in priority order)

### 1. Neon quota (P1-52) — now ALSO gates the promote PR
- **What's needed:** raise or reset the Neon plan limit for `solitary-thunder-20087776` (koralink-prod).
- **Click-path:** console.neon.tech → project **koralink-prod** → Billing/Usage → upgrade plan OR check the free-tier reset window (project created Sep 25 → monthly reset may land ~Oct 25–26; re-check tomorrow if you prefer free).
- **Why it blocks:** PR #178 (promote, 312 commits) has a HARD pre-merge gate = Neon reachable; merging into a quota-blocked prod DB would ship code whose schema can't be verified/migrated.
- **Evidence (run #165):** `psql` → `ERROR: Your account or project has exceeded the quota. Upgrade your plan to increase limits.`

### 2. Promote PR #178 — merge (T2, your click) once #1 clears
- **Order (lean free-tier runbook, in the PR body):** (a) Neon reachable → (b) apply migrations FIRST from any Neon-resolving machine (your Mac works; the VPS host is DNS-blocked but the factory proved a container route on request):
  `MIGRATE_DATABASE_URL=<neon-url from Render env> node scripts/migrate-vps.mjs`
  (pending: 0052/0053/0054) → (c) merge PR #178 → (d) Render dashboard → Manual deploy → (e) post-release matrix (factory runs it next run if you ping).

### 3. Resend transactional-email keys (P1-41 ledger row — unlocks the run-#165 email lane)
- The partner email lane is BUILT and LIVE in log-only mode (PR #179 f1385a2): payout-request receipts + venue-owner cancellation emails. Without keys every send logs-and-skips.
- **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env (dashboard click-path: dashboard.render.com → koralink-api → Environment → add the two vars). Owner-only per DECISIONS.md (email keys).
- **Close-line:** "RESEND keys added on Render" (factory verifies a live log-only→send flip next run).

## ✅ Closed since last update (no action left)
- P2-208 ghost Vercel project — disconnected (owner, Oct 25). PR #179 was birth-clean (escape #23 by birth).
- P2-51 Render migrate hook — closed lean (paid-only confirmed; autoDeploy OFF + migrate-first runbook is the standing order).
- P0-2 PSP — Moyasar sandbox keys staged in .deploy-tokens; factory lane unlocked (pick-order item 4). ⚠️ Live secret transited chat — regenerate it in the Moyasar dashboard before go-live.
- P1-38+P2-50 storage — SeaweedFS S3 LIVE on the VPS (koralink-storage.service); StorageModule slice queued.
- P2-47 (b) restore-on-behalf; P1-69 dispute taxonomy default; P1-12 RTL visual — all owner-cleared Oct 25 (factory builds queued).

## 🟢 Factory lanes queued (no owner input needed)
1. **P1-69 player dispute origination** — UNLOCKED (owner accepted default; run ≥ #166 = next run).
2. P2-47(b) restore-on-behalf gate cycle.
3. Moyasar wallet top-up slice (sandbox keys staged; follow docs/plans/psp-sandbox-moyasar/00-strategy.md).
4. StorageModule slice (SeaweedFS live; docs/plans/upload-pipeline-vps/00-plan.md).
5. P2-258 push-prompt + P2-259 bell-socket invalidation (strong PWA picks).
