# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #181, 2026-10-31 12:5xZ)

Snapshot: open PRs = **1** (#178 promote, owner-gated) · services API/PWA/Admin all active · staging @ `ea8c2ab` · **P1-52 Neon quota: 68 events/24h — still OVER the ≥60 flag (owner billing action unchanged) · hex baseline 335/64** · **NEW: avatar uploads LIVE on staging (flag ON) — try it on your profile page**.

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon free-tier quota (chronic; BLOCKS: promote PR #178 AND Neon applies for 0055+0056+0057)
- **Run #181 reading: 68 events/24h (was 66). Two windows in a row over the flag — the monthly reset has not landed.** The daily push_subscriptions cleanup failure (13×/24h) is the SAME quota error, deduped here.
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or verify the monthly free reset (project birthday Oct-25).
- **Close-line:** "Neon quota cleared" (then the factory applies 0055+0056+0057 to Neon and #178 becomes mergeable).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge)
- Gate GREEN, ~362 commits ahead of main. **Migrations riding it: 0055 (users.locale) + 0056 (wallet_topup_intents) + 0057 (venues.images).**
- Sequence when P1-52 clears: (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs`; (2) YOU merge #178; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
- **Prod note (new this run):** add `AVATAR_UPLOAD_ENABLED=true` + `S3_BUCKET_AVATARS=koralink-avatars` + the S3_* pair to the Render API env when the promote lands (avatar uploads are live on staging, flag OFF = clean 403 so nothing breaks without it).
- **Close-line:** "Merged #178 + Render deployed".

## 🟡 Owner actions (not blocking the factory)

### 3. P0-2 sandbox happy-path (post-promote, staging-first)
- Moyasar wallet top-up is BUILT and LIVE (flag OFF). To exercise the real 3DS happy path: flip `WALLET_TOPUP_ENABLED=true` + MOYASAR_*_TEST keys on the API env (staging first), restart, then run one SAR 5.00 top-up with mada test card **4201320111111010** from a real browser.
- **Close-line:** "Topup flag flipped + test top-up done".

### 4. Resend transactional-email keys (P1-41 — unlocks the run-#165 email lane)
- Partner email lane BUILT and LIVE log-only. **What's needed:** `RESEND_API_KEY` + `MAIL_FROM` on the Render API service env. Owner-only per DECISIONS.md.
- **Close-line:** "RESEND keys added on Render".

### 5. Moyasar live-secret regeneration (pre-go-live only)
- The LIVE secret transited chat once — regenerate in the Moyasar dashboard before go-live. Not needed for sandbox.
- **Close-line:** "Moyasar live secret regenerated".

### 6. Product calls waiting on you (do NOT build without them)
- **6a. Player wallet withdrawal path (run #175 finding, P1-27):** every credited SAR is locked in-app; no way to withdraw. Needs your rail call (Moyasar Transfers? bank IBAN payout? minimum balance?).
  **Close-line:** one line naming the rail (e.g. "withdrawals = Moyasar transfers to card, min SAR 50") → factory opens the Gate cycle.
- **6b. DIRECT venue/pitch booking surface (run #177):** players can browse venues + slots but cannot BOOK a court directly — monetization is match-host-only. Is direct booking on the roadmap (P0-scale new module) or match-host-only for now?
  **Close-line:** "Booking: yes, plan it" / "Booking: match-host-only for now".
- **6c. Settlement void/cancel policy (P2-285):** admin settlements have NO void path; a duplicate/erroneous row needs direct DB today. Void-while-pending-only + audit trail? Or "pay carefully + CSV" for now?
  **Close-line:** "Void: yes, pending-only + audit" / "No void path needed".
- **6d. Recurring-match series identity (run #121):** 8 weekly instances are independent matches; a cancelled week does not propagate. Product-shape call needed.

## 🟢 Optional

### 7. Try the NEW avatar upload yourself (staging — LIVE since run #181)
- Open the PWA profile page → camera badge on your avatar (bottom-right) → pick a photo (≤2 MB JPEG/PNG/WebP) → toast "Profile photo updated" + avatar swaps in. Public serve route: `/media/avatars/...`, immutable-cached.

### 8. Try the venue-photo pipeline (staging, no factory needed)
- Admin console → Venues → edit any venue → Add photos (≤6, JPG/PNG/WebP ≤5MB) → Save → open the clubs page / venue detail in the PWA.
