# OWNER QUEUE — Abdullah's one-stop action list (refreshed run #180, 2026-10-31 02:1xZ)

Snapshot: open PRs = **3** (#178 promote, owner-gated · #203 P2-289 top-up amount UX + #204 P2-248 metrics throttle — factory merges when checks green) · services API/PWA/Admin all active · staging @ `aeb8478` · **P1-52 Neon quota: 66 events/24h — CROSSED the ≥60 flag (still the same chronic free-tier class; owner billing action unchanged) · hex baseline 324/64**.

## 🔴 Owner actions (blocking)

### 1. P1-52 — Neon free-tier quota (chronic; BLOCKS: promote PR #178 AND Neon applies for 0055+0056+0057)
- **Run #180 reading: 66 events/24h — first time OVER the ≥60 flag line (run-#177's re-baseline said 5/24h flat; this window is materially worse — the monthly reset may not have landed). Also deduped into this item: the daily push_subscriptions cleanup delete failing 12×/24h — its Sentry event detail is the SAME PostgresError quota message, not a separate bug.**
- **What's needed (unchanged):** console.neon.tech → koralink-prod (solitary-thunder-20087776) → Billing/Usage → upgrade, or check whether the monthly free reset landed (project birthday Oct-25).
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

### 6b. NEW (run #177 — product call): DIRECT venue/pitch booking surface
- Reviewer B (run #177) flagged: a player can browse venues + open slots but cannot BOOK a court directly — monetization is match-host-only (pitches.controller has GET slots only; no bookings table). This is the product's biggest scope hole, not a defect.
- **What's needed:** your product call — is direct booking on the roadmap (P0-scale new module: bookings table + partner calendar + payment leg) or is match-hosting the intended only path for now?
- **Close-line:** "Booking: yes, plan it" / "Booking: match-host-only for now".

### 6c. NEW (run #178 — policy call, money-adjacent): settlement void/cancel path (P2-285)
- Admin settlements have NO void/cancel — a duplicate or erroneous settlement row can only be fixed via direct DB access (list/findOne/pay/generate is the whole API surface; lifecycle strictly pending→paid). Before the factory builds anything: does a void path exist in your ops mental model (void while pending only, audit-trailed, never after paid)? Or is "pay carefully + CSV for reconciliation" the intended workflow for now?
- **Close-line:** "Void: yes, pending-only + audit" (factory opens the Gate cycle) / "No void path needed".

## 🟢 Optional

### 7. Try the venue-photo pipeline yourself (staging, no factory needed)
- Admin console → Venues → edit any venue → Add photos (≤6, JPG/PNG/WebP ≤5MB) → Save → open the clubs page / venue detail in the PWA.
