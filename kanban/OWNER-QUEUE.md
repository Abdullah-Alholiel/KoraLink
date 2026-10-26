# Owner Action Queue — KoraLink

**Updated:** 2026-10-26 ~17:1xZ (run #167). The factory loop REGENERATES this file every
run. Close an item by pasting its close-line to the agent.

## Snapshot
- Open PRs: **1** — **#178 promote (staging→main)**, CLEAN/MERGEABLE, waiting on you (gated by Neon quota below). Run #167 merged two feature PRs (#181 restore-on-behalf, #182 push nudge) — both LIVE on the VPS.
- Services: api/pwa/admin/storage all green · API health 200 · journal error-clean 5h · PWA serves the P2-258 build (chunk marker verified)
- Promote gap: staging is now **321 commits ahead of main** (last promote 2026-09-25) — the longer this waits, the bigger the release diff.
- **P1-52**: Neon prod quota-blocked (44 Sentry events/24h through 15:00Z Oct 26, creeping +1/run). Project birthday was Oct-25 — the free reset may already be due; one console visit answers it.

## 🔴 Blocking actions (in priority order)

### 1. Neon quota (P1-52) — now ALSO gates the promote PR
- **What's needed:** raise or reset the Neon plan limit for `solitary-thunder-20087776` (koralink-prod).
- **Click-path:** console.neon.tech → project **koralink-prod** → Billing/Usage → upgrade plan OR check the free-tier reset window (project created Sep 25 → monthly reset may land ~Oct 25–26; run #167 still saw the error at 15:00Z Oct 26 — re-check now).
- **Why it blocks:** PR #178 (promote) has a HARD pre-merge gate = Neon reachable.
- **Close-line:** "Neon quota cleared" (factory re-probes and confirms before flagging #178 mergeable-for-real).

### 2. Promote PR #178 — merge (T2, your click) once #1 clears
- **Order (lean free-tier runbook):** (a) Neon reachable → (b) apply migrations FIRST from any Neon-resolving machine (your Mac works; the VPS host is DNS-blocked):
  `MIGRATE_DATABASE_URL=<neon-url from Render env> node scripts/migrate-vps.mjs`
  (pending: 0052/0053/0054) → (c) merge PR #178 → (d) Render dashboard → Manual deploy → (e) post-release matrix (factory runs it next run if you ping).
- **Standing step (run #166):** after any promote merge the factory back-merges main→staging with `-s ours` — the recurring-conflict class stays closed.

### 3. Resend transactional-email keys (P1-41 ledger row — unlocks the run-#165 email lane)
- The partner email lane is BUILT and LIVE in log-only mode (PR #179 f1385a2): payout-request receipts + venue-owner cancellation emails. Without keys every send logs-and-skips.
- **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env (dashboard.render.com → koralink-api → Environment).
- Owner-only per DECISIONS.md (email keys). **Close-line:** "RESEND keys added on Render".

## ✅ Closed since last update (no action left)
- **P2-47(b) restore-on-behalf — BUILT run #167** (PR #181, live-probed): admins can restore soft-deleted accounts / cancel scheduled purges from the users console within the 30-day grace window; hard-purged ghosts stay irreversible (PDPL).
- **P2-258 push opt-in — BUILT run #167** (PR #182, live): one-time contextual invite right after a booking succeeds; 24h dismissal cooldown; never re-asks after grant/deny.
- P2-259 bell realtime — closed verified-no-build (already socket-driven; poll is the offline fallback).
- P2-208 ghost Vercel project — disconnected (owner, Oct 25; zero ghost checks on #181/#182 — holding).
- P2-51 Render migrate hook — closed lean (paid-only confirmed; migrate-first runbook standing).
- P0-2 PSP — Moyasar sandbox keys staged; wallet slice queued (pick-order item 4). ⚠️ Live secret transited chat — regenerate in the Moyasar dashboard before go-live.
- P1-38+P2-50 storage — SeaweedFS S3 LIVE on the VPS; StorageModule slice queued (pick-order item 5).
- P1-69 dispute origination — BUILT run #166 (PR #180, live).

## 🟢 Factory lanes queued (no owner input needed)
1. **P2-264 payout-email locale fix** (small, money-adjacent parity — run-#167 Reviewer B finding).
2. P2-260 + P2-263 offline-copy pickup pair (wallet + dispute sheet, one error-classify pass).
3. P2-47(b) REMOVED — built this run. Moyasar wallet slice (pick-order 4) and StorageModule (pick-order 5) remain queued behind the smaller items.
