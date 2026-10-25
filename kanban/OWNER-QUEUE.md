# Owner Action Queue — KoraLink

**Updated:** 2026-10-25 14:1xZ (post-decisions session). The factory loop REGENERATES this
file every run (loop skill Phase 5). Close an item by pasting its close-line to the agent.

## Snapshot
- Open PRs: 0 · services api/pwa/admin/gateway: all green · API health 200
- Last promote: 2026-09-25 — staging +310 ahead of main · staging CI green (PR Gate + Semgrep ✅ on current HEAD)
- **Audit verdict (2026-10-25): SAFE TO PROMOTE** — checklist in chat + promote-plan doc.

## ✅ Decisions closed this session (2026-10-25)
- **P1-69**: default ACCEPTED (existing DisputeType enum) — run ≥ #166 builds player dispute origination.
- **P1-12 admin RTL visual**: owner confirmed all good — CLOSED.
- **P2-47**: option (b) full restore-on-behalf — gate cycle to follow.
- **P2-214**: path (a) + EXPANDED scope — partner email notifications for payout/pitch/match-cancellation updates (mailer exists: Brevo on Render, Resend staging; fold into one email-lane slice).
- **P1-38+P2-50 upload pipeline**: DECIDED — self-hosted on the VPS (Coolify app: MinIO) while R2 is dashboard-disabled; revisit R2 at public launch. Implementation plan: `docs/plans/upload-pipeline-vps/00-plan.md` (owner step: one Coolify UI click to create MinIO, then factory builds).
- **P0-2 PSP**: DECIDED — Moyasar, sandbox-first on prod as demo. Strategy: `docs/plans/psp-sandbox-moyasar/00-strategy.md`. Owner step: free sandbox account → 2 test keys into `.deploy-tokens`.

## 🔴 Manual owner actions (dashboards I cannot mutate from this session)

### 1. Vercel — ghost "kora-link" project (P2-208) · RESOLVED ✅ 2026-10-25
- Owner disconnected Git + paused it (API-verified: link=null). Checks stop firing on new PRs.
- Project intentionally KEPT (owner choice) — no delete.

### 2. Render — pre-deploy migrate hook (P2-51) · CLOSED free-tier lean ✅ 2026-10-25
- Screenshot confirmed Pre-Deploy Command is PAID-ONLY; owner keeps free tier.
- Lean posture instead: autoDeploy already OFF (API-verified) + migrate-first runbook
  (`MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs` BEFORE any manual deploy).
  P2-51 closes as resolved-by-ops; the Dockerfile scripts/ COPY is dropped (not needed).

### 3. Moyasar sandbox keys · DONE ✅ 2026-10-25
- `MOYASAR_PUBLISHABLE_KEY_TEST` / `MOYASAR_SECRET_KEY_TEST` (and the _LIVE pair the owner
  added) stored in `.deploy-tokens` (0600). ⚠️ Live keys transited chat — regenerate the live
  secret in the Moyasar dashboard before go-live.
- Factory lane unlocked: wallet top-up vertical slice (strategy docs/plans/psp-sandbox-moyasar/).

### 4. Coolify — create MinIO (upload pipeline step 1) · DONE ✅ 2026-10-25
- MinIO turned out to be ARCHIVED (dl.min.io 410s everything, Hub namespace pull-denied).
- Deployed instead: **SeaweedFS S3** as `koralink-storage.service` (systemd --user, localhost-only,
  buckets koralink-venues/koralink-avatars, creds in .deploy-tokens as S3_*). E2E verified.
- No owner action left — factory builds the StorageModule slice next.

### 5. Neon quota — likely SELF-RESOLVED
- Counter read ~110 CU-hrs at 14:00Z Oct 25 with compute now 0 and errors stopped 10:00Z → consistent with the monthly reset (project created Sep 25). Next factory run re-checks; if 1C re-fires, the Launch-plan decision returns here.

## 🟢 Factory lanes queued (no owner input needed)
1. Promote package lane: Dockerfile pre-deploy fix + promote PR assembly → **merge click = owner (T2)**.
2. Partner email lane: payout/pitch/match-cancel updates to partner emails (#9 expansion).
3. P2-47(b) restore-on-behalf gate cycle. 4. Player dispute origination (P1-69 build, run ≥ #166).
5. Upload pipeline slice (after MinIO). 6. Wallet Moyasar sandbox slice (after keys).
