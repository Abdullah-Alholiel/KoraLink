# Run #135 — Gate 0 Retrospective (P1-66 push VAPID last mile)

**Lane:** DB & Infra (135 % 4 = 3) · **Date:** 2026-10-15 · **Mode:** autonomous

## DECISIONS.md check (owner-standards ledger, read FIRST)

No ledger entry covers push/VAPID. No design/UX standard is touched by this item: the only
user-facing delta is a NEW honest "not configured" hint line (error-message standard: what
happened + why + what next — matches the 2026-09-06 copy standard in the ledger's spirit).
EN+AR parity maintained per the 2026-09-08 marketing/EN+AR rule. No Drawer/admin/RBAC/money
surface touched. **No contradiction. Proceed.**

## Area audit (what the last cycles did to the push/notification surface)

- Run #69 (P2-91/P2-92): subscribe outcome contract (`PushSubscribeOutcome`), worker
  `pushsubscriptionchange` handler + push-meta Cache-API KV. Left the VAPID public key
  hardcoded in hook + worker.
- Run #70 (P2-96): failed-server-POST rollback — the toggle never lies about server rows.
- Run #26 (P0-8): push-endpoint SSRF validator (send + subscribe). Run #28 (P0-5): per-category
  prefs. Run #13 (P1-20): mute/quiet hours. Run #35/#36 (P1-41): email mirrors — self-disable
  until owner provisions keys.

**The pattern this run closes:** KoraLink built the ENTIRE push stack (subscribe UX, SSRF
guard, locale sync, rotation handler, prefs) while the last mile — the keypair — was never
provisioned. Server: no VAPID_* in apps/api/.env → every send skipped (notifications.service
self-disable log). Client: the hardcoded key is the PUBLIC half of the Google web-push
**codelab demo keypair whose private half is published on the internet** — if anyone ever
"fixed" the server by pasting the codelab private key, anyone could push to KoraLink
subscriptions. That is a latent spoofing hazard parked in plain sight across 3 source files
+ 2 test pins + every built worker chunk.

## Findings classification

- **CRITICAL (latent security):** demo/codelab VAPID public key hardcoded in
  `usePushNotifications.ts:20-21`, `worker/index.js:56-58` (pinned in 2 test files). Public
  keys are safe to ship — but THIS one's private half is public on the internet; the
  rotation handler would re-subscribe new users to it forever.
- **CRITICAL (broken user flow, silent):** no VAPID keys server-side → all push sends
  skipped since the feature shipped; the profile toggle shows a working subscribe flow into
  a dead end (P2-96 rollback means it fails honestly per-user, but the feature is 0%).
- **IMPORTANT (honesty):** no 'not-configured' UX state — a deployment without keys gives
  users the install/permission hints, all pointing at a feature that can never work there.
- **MINOR (Reviewer A):** `ws-origin.ts` duplicates localhost defaults in two module-level
  sites (drift risk) → boarded P2-205.
- **MINOR (Reviewer B):** stale `apps/api/.env.bak-cors-20260908` with old allowlists sits in
  the repo dir (untracked) — drift trap for future greps. NOT deleted (owner artifact);
  flagged for Abdullah.

## Fix:feat ratio & tech debt

Recent 5 commits: 3 feat/fix + 2 docs → healthy. No new debt from this item: env-keying
REMOVES a hardcoded constant (net debt reduction).

## Verification snapshot at Gate 0

- API health 200 (:3001); 3 services active; zero API errors in 5h journal window.
- Hex lane clean (10/10 metrics at baseline).
- Sentry 24h: no new signatures (CORS attacker.example = expected P2-185 denial noise).

## Gate decision

PROCEED to Gates 1–3 (single compact doc). Item is vertical-slice sized: no DB migration, no
schema change, one env contract + one honest-UX state + tripwire tests. Owner-optional
(factory-built): enabling push in a deployment = owner pastes generated keys into .env and
restarts — the CODE makes that possible and safe; Abdullah keeps key custody (matches the
ledger's credential-actions owner-only rule; we generate NOTHING into the repo).
