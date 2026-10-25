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

### 1. Vercel — kill the ghost "kora-link" project (P2-208) · ~2 min
- Verified: 8/8 recent deployments BLOCKED, zero successes ever → safe.
- https://vercel.com/abdullah-alholaiels-projects → **kora-link** → Settings → General → scroll to **Dangerous** → **Disconnect from Git** (preferred non-destructive) → then **Delete Project**.
- Kills the permanent ❌ "Deployment was blocked" PR check.

### 2. Render — pre-deploy migrate hook (P2-51) · ~3 min · merge-ready ✅ verified by API
- https://dashboard.render.com → **koralink-api** (srv-dadabif10e5c73e207bg, free tier) → **Settings** → Build & Deploy → **Pre-Deploy Command**: `node scripts/migrate-vps.mjs`
- Save → Render may prompt to deploy — allow it (this deploy will then run migrations first).
- ⚠ One follow-up: the Docker runtime image lacks `scripts/` — one `COPY scripts ./scripts` line in the root Dockerfile must ride the promote (queued as promote-package item; without it the pre-deploy command fails until the promoted image lands).
- Also verified: `autoDeploy` is already OFF — pushes to main never auto-deploy; you deploy manually. Trap contained already; hook is defense-in-depth.

### 3. Moyasar sandbox account (P0-2 step 1) · ~10 min · free, no CR needed
- https://dashboard.moyasar.com/register/new → verify → copy `pk_test_…` + `sk_test_…`
- Add to `/home/ubuntu/.hermes/profiles/koralink/.deploy-tokens` as `MOYASAR_PUBLISHABLE_KEY_TEST` / `MOYASAR_SECRET_KEY_TEST` → tell the agent the NAMES only.
- Then the factory builds the wallet top-up vertical slice (P3 in strategy doc).

### 4. Coolify — create MinIO (upload pipeline step 1) · ~5 min · free
- Coolify UI (local :8000) → New Resource → **Docker Compose empty** (or service) → image `minio/minio` → console command `server /data --console-address ":9001"` → internal port 9000 (console 9001) → bind to the VPS **Tailscale IP only** (100.93.99.24), never 0.0.0.0 → create disk volume `minio-data` → deploy.
- Then tell the agent "MinIO is up" — factory wires endpoint keys + API + PWA.

### 5. Neon quota — likely SELF-RESOLVED
- Counter read ~110 CU-hrs at 14:00Z Oct 25 with compute now 0 and errors stopped 10:00Z → consistent with the monthly reset (project created Sep 25). Next factory run re-checks; if 1C re-fires, the Launch-plan decision returns here.

## 🟢 Factory lanes queued (no owner input needed)
1. Promote package lane: Dockerfile pre-deploy fix + promote PR assembly → **merge click = owner (T2)**.
2. Partner email lane: payout/pitch/match-cancel updates to partner emails (#9 expansion).
3. P2-47(b) restore-on-behalf gate cycle. 4. Player dispute origination (P1-69 build, run ≥ #166).
5. Upload pipeline slice (after MinIO). 6. Wallet Moyasar sandbox slice (after keys).
