# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #182, 2026-10-31 16:2xZ)

Snapshot: open PRs = **1** (#178 promote, owner-gated) · services API/PWA/Admin all active · staging @ `8391831` · **P1-52 Neon quota: 69 events/24h (run #182 reading) — THIRD window ≥60; run #181's escalation trigger fired: treat as a HARD BLOCK on the promote until cleared** · hex baseline 337/66 · **NEW: venue-review moderation LIVE — try it in the admin console (/reviews)**.

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon free-tier quota (CHRONIC — ESCALATED run #182: hard-block recommendation)
- **Three consecutive windows ≥60 (66 → 68 → 69 events/24h; the monthly reset did NOT land). The daily push_subscriptions cleanup failure (13×/24h) is the SAME quota error.** Run #181's escalation trigger (≥60 persisting across windows) has fired: this is now recommended as a HARD BLOCK on promote #178 until cleared — a promote-merge during quota exhaustion risks failed post-merge migrations on Neon.
- **What's needed:** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or verify the monthly free reset (project birthday Oct-25 — already passed without relief).
- **Close-line:** "Neon quota cleared" (then the factory applies 0055+0056+0057+0058 to Neon and #178 becomes mergeable).

### 2. PR #178 — promote staging → main (T2 gate, YOUR merge — HARD-BLOCKED by item 1)
- Gate GREEN, ~366 commits ahead of main. **Migrations riding it: 0055 (users.locale) + 0056 (wallet_topup_intents) + 0057 (venues.images) + 0058 (venue_reviews.hidden_at — new this run).**
- Sequence when P1-52 clears: (1) Neon migrations FIRST: `MIGRATE_DATABASE_URL=<neon-url> node scripts/migrate-vps.mjs`; (2) YOU merge #178; (3) YOU trigger the Render deploy manually (autoDeploy OFF); factory runs the post-promote matrix on request.
- **Prod note:** add `AVATAR_UPLOAD_ENABLED=true` + `S3_BUCKET_AVATARS=koralink-avatars` + the S3_* pair to the Render API env when the promote lands (avatar uploads live on staging; flag OFF = clean 403 so nothing breaks without it).
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
- **6e. NEW (P2-297, run #182): venue rating aggregates vs moderation** — hiding/deleting a review currently does NOT recompute `venues.rating_avg`/`rating_count`. Policy call: should hidden reviews keep counting toward the public average? (a) recompute excluding hidden, (b) keep counting (hide = order-only), (c) recompute only on delete.
  **Close-line:** one letter (a/b/c) + any nuance.

## 🟢 Optional

### 7. Try the NEW venue-review moderation (staging — LIVE since run #182)
- Admin console → **Reviews** (new sidebar item) → any review → drawer: **Hide / Restore / Delete** (delete asks confirm). Hidden reviews vanish from the venue page immediately and every action is audit-logged (Audit page shows `venue_review` entries).

### 8. Try the avatar upload yourself (staging — LIVE since run #181)
- PWA profile page → camera badge → pick a photo (≤2 MB JPEG/PNG/WebP). **Run #182 polish: oversized photos now rejected instantly client-side; a disabled feature shows its own message.**

### 9. Try the venue-photo pipeline (staging, no factory needed)
- Admin console → Venues → edit any venue → Add photos (≤6, JPG/PNG/WebP ≤5MB) → Save → open the clubs page / venue detail in the PWA.
