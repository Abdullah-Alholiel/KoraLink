# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #171, 2026-10-28 03:2xZ)

Snapshot: open PRs = **1** (#178 promote owner-gated — #186/#187 both factory-merged this run) · services API/PWA/Admin all active · staging @ `4c63ab6` · **P1-52 Neon quota still the top blocker (51 events/24h)** · venue-photo pipeline COMPLETE end-to-end (admin upload → player display, live-verified).

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon quota exhausted (BLOCKS: promote PR #178 AND Neon applies for 0055+0056+0057)
- Sentry: **51 quota events/24h** (00:0xZ Oct 28; creeping +2 this run, 16th consecutive watch). The prod push-subscription sweep (1F) is the SAME quota error — the limit silently disables prod stale-push cleanup.
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or wait for the monthly reset window. Project birthday Oct-25 — the free reset may already be due; one console visit answers it.
- **Close-line:** "Neon quota cleared" (then factory applies 0055+0056+0057 to Neon and #178 becomes mergeable).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge)
- Gate GREEN. **~335 commits ahead of main** (venue-photo pipeline rides it: #186 + #187 + PR-Agent-hardened media stack).
- **Migrations riding it: 0055 (users.locale) + 0056 (wallet_topup_intents) + 0057 (venues.images).** Sequence when P1-52 clears: (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs` (from a network that reaches api.neon.tech, or the container route); (2) YOU merge #178; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
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

## 🟢 Optional (say one line and the factory does it)

### 6. P2-270 — clean 2 dangling venue-photo refs on staging (NEW run #171)
- Found by live E2E: Malqa Ladies Arena + Olaya Sports Park reference a SeaweedFS object deleted by run #170's own E2E cleanup (cleanup raced its append). Users never see it (photo falls back to the letter avatar), but the refs are dead.
- **Close-line:** "clean it" → next run PATCHes both rows to `[]` in ~10 minutes.

### 7. Try the venue-photo pipeline yourself (staging, no factory needed)
- Admin console → Venues → edit any venue → Add photos (≤6, JPG/PNG/WebP ≤5MB) → Save → open the clubs page / venue detail in the PWA: your photos now render on cards and the hero. (This already works — Abdullah's earlier test uploads are the 2 real photos on staging.)
