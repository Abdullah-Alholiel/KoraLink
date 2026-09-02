# Run #25 — Retrospective (koralink-booking wallet TOCTOU fix)

## Audit window
- Baseline: main HEAD `dcd8192` (PWA install flow), run #24 in_review (P2-2 dispute replies built + 4 Reviewer-A follow-ups).
- Cycle focus: run# mod 4 == 1 → API modules.
- Trigger: Reviewer A run #25 IMPORTANT #1 (matches.service.ts:1249-1268).

## What landed in the audit window
- `ec7cc56` P2-2 dispute replies (POST /admin/disputes/:id/messages)
- `87386cf` resolve() in-tx guarded UPDATE first + reopen() same guard (CRITICAL fix)
- `34694a1` push-text hardening: `kickoffFallback` no `new Date()` → `'--:--'`; `'Match'` renudge title fallback; Sentry.captureException in sendPushToUsers catch
- `5c57649` worker deep-links: match-cancelled, player-removed, match-rescheduled, report-resolved
- `dcd8192` (sibling) PWA install flow

## Stands-verified from REVIEWER A run #25 (CRITICAL: 0 · 3 IMPORTANT)
- 1. **matches.service.ts:1249-1268** — koralink-booking wallet TOCTOU
- 2. next.config.mjs:173 — CSP `script-src 'unsafe-inline' 'unsafe-eval'` (standing item 11, recurring)
- 3. notifications.service.ts:234-238 — Sentry captures every 429/400 (flood risk)

## Stands-verified from REVIEWER A run #25 (refuted)
- `eq(col,null)` 0 hits · `::uuid` 0 hits · `findFirst({with:})` inside tx: 0 · bare `.returning()` contract: all 10 sites compliant · PWA hydration grep clean · console.* 3 justified error paths · z-index 1 z-50 (BottomNav) no collisions · admin i18n 525/525 ✓ · cache interceptor per-user guards ✓ · WS @SubscribeMessage auth all 5 handlers check userId · run #24 in_review items ALL verified (P2-2 atomicity, 34694a1 hardening, 5c57649 routes, admin i18n 525/525)

## Stands-verified from REVIEWER B run #25
- P0-1 real payment provider (P0-2 boarded, prod-gated) — **NOT in scope** this run (BLOCKED on real provider decision)
- P0-2 NEW: no per-category push prefs (global push_muted + quiet hours only) — product decision + schema change; DEFER to next run as a new P0 card
- P0-3 NEW: PDPL account-delete / data-export absent — **NOT in scope** (legal surface; needs scope decision)
- P1: padel, skill-level filter, waitlist, typing/presence, profanity auto-filter, admin broadcast tool, player withdrawal, WS-reconnect UX — backlog
- P2: matches BOARD items + small refinements

## Tech debt / risk
- Wallet is still the closed loop of dummy credits (P0-2); the run's fix does not depend on a real provider — it's a server-side atomicity improvement that benefits any wallet (dummy or real).
- The `users.wallet_balance` column is `numeric` (per BOARD schema); the in-tx conditional UPDATE with `>=` guard is safe.
- Host's `users` row is NOT row-locked in the booking tx; only the `pitch_slots` row is. Two concurrent bookings of DIFFERENT slots by the same host can race. The fix adds a conditional UPDATE on `users` that fails fast when balance is insufficient — even under concurrency, the second writer's UPDATE returns 0 rows because the first has already debited.
- The `slot-booking-<slotId>` ledger key is unique per slot, so a true concurrent same-slot booking is already blocked by P0-4's slot FOR UPDATE lock + the unique constraint. The remaining race is "two different slots booked at the same time" which is the realistic case (hosts creating a season of matches at once).

## Cycle plan
- **Item**: P1-1 new: Koralink-booking wallet TOCTOU (matches.service.ts:1249-1268) — fix
- **Co-fix**: notifications.service.ts:234-238 Sentry noise — quick sample (P2-class, batched in same slice to keep reviewer-A's findings decaying)
- **Descoped this run**:
  - CSP `unsafe-inline`/`unsafe-eval` (multi-run, needs nonce migration; standing backlog)
  - Per-category push prefs (schema + product decision; new P0 card for next run)
  - PDPL delete/export (legal scope; new P0 card for next run)
  - Padel, skill-level, waitlist, presence, profanity, broadcast, withdrawal, etc. (deeper scope; backlog)
- **ADMIN state check**: clean. NOT touching apps/admin this run.
- **Strix**: running in background (koralink-src_fa31). Budget guard 45 min; if it ends early, intake is appended to the run report.

## Recommended: ONE item build + ONE bundled polish
Vertical slice (one commit): conditional UPDATE + post-update negative-balance guard + zero-rows → 409 + 2-3 jest specs (concurrent winner/loser + self-mode unaffected + insufficient-balance throws 400).
Vertical slice 2 (same commit or tiny follow-up): notifications.service.ts Sentry noise gate.

## Verifications
- `npm run build` 3/3
- `npx jest -C apps/api` (the matches suite)
- `npx vitest run` (no PWA changes; unchanged)
- `npx tsc --noEmit` (PWA + API)
- Live probe: restart API, concurrent createMatch same host (koralink, 2 different slots, balance 100 SAR, cost 80 each) — first 201, second 409.
