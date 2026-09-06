# Run 37 — Gate 0 Retro (joinMatch row locks + WS limiter eviction)

## What this cycle touches
1. `apps/api/src/modules/matches/matches.service.ts` — joinMatch/leaveMatch/removePlayer tx concurrency.
2. `apps/api/src/modules/gateway/rate-limit.service.ts` + `app.gateway.ts` — limiter memory lifecycle.

## Evidence base (why now)
- **Reviewer A CRITICAL (run #37):** joinMatch count-then-insert has NO row lock —
  `matches.service.ts:947-1043`: count at :1000, insert at :1033 inside tx but the match row is
  never locked. Two concurrent joins both read `count < max`, both insert → overbook; the loser's
  Open→Full flip (:1038) fires `WHERE status='Open'` only, leaving the match Open with
  max_players+1 rows. Exactly the P2-49 carve-out recorded by run #36 ("joinMatch
  count-then-insert overbook race — fix = FOR UPDATE on matches row … needs careful dead-lock
  ordering with rescheduleMatch slot locks").
- The codebase already locks rows `FOR UPDATE` in cancelMatch (:1704 area, match row first) and
  rescheduleMatch (:1862 area, slots ordered by id). join/leave/remove were left out.
- **Reviewer A IMPORTANT:** `WsRateLimitService.hits` (rate-limit.service.ts:24) never evicts —
  `handleDisconnect` (app.gateway.ts:186) doesn't call back. Unbounded Map growth on a
  long-lived host.

## Standing bug-class sweep (Reviewer A, this run)
No `::uuid` casts, no `eq(col,null)`, no console.* in API prod paths, no mutation
return-contract violations. Recent landings 894c3ac/d9023a9/faabbce spec-covered.

## Prior-cycle verification (this run, evidence)
Build 3/3 (FULL TURBO cached → forced fresh check at cycle end), vitest 371/371 (52 files),
jest 379/379 (45 suites). Live probes: /en/host-guide 200, unauth PATCH /email/me → 401.
All 4 run-#36/owner-session claims CONFIRMED (Reviewer B + self).

## Refuted reviewer product-gaps (recorded, not boarded)
- "No push channel" — REFUTED: notifications.service.ts:5,68,191 web-push + VAPID (P0-5, run #28).
- "No player-facing reporting" — REFUTED: ReportSheet P1-31 (verified-OK list).
- "Wallet lacks UX states" — REFUTED: wallet/page.tsx:76-83,148,235,350 (verified-OK list).

## Conclusion
Proceed to Gates 1-3 (01-program-design.md). Both items are vertical-slice sized, non-admin,
no external dependencies.
