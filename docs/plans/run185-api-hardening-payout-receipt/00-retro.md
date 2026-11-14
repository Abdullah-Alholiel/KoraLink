# Run #185 — Gate 0 Retro (API modules lane, 185%4=1)

**Ledger check:** `kanban/DECISIONS.md` read first — no entry contradicts this cycle's items
(all are hardening/observability, zero design/UX change; the payout-receipt card renders
inside the existing match-detail wallet section per the money-truth standards already in the
ledger via P2-276/279).

## Health snapshot (10:20Z)
- Services: api/pwa/admin all `active`; `/api/v1/health` 200.
- journalctl -p err last 5h: **zero entries** across all three services.
- Sentry 24h: **zero new signatures** — newest issue is KORALINK-API-1C lastSeen 2026-10-31
  (the resolved 1C quota storm, run #183); CORS-B (Oct 13) and 1F (Oct 31) are old/known.
- Prod Neon backup: landed 03:22Z on schedule (watchdog §4b live from run #184).

## Run #184 claims verification (claims ≠ facts)
- P1-71 avatar gate: `avatar_url` validation present in compiled
  `dist/src/modules/users/users.service.js` (16 hits) — Reviewer B confirmed service :477 +
  DTO :24 + spec live. VERIFIED.
- P1-70 room eviction: `evictFromMatch` in compiled `dist/src/modules/gateway/app.gateway.js`
  — Reviewer B confirmed callers = matches.service leave :2077 + removePlayer :4097; admin
  ban path uses `disconnectUser` (superset). VERIFIED (attribution nuance noted).
- P2-303 watchdog prod-backup freshness: script carries koralink-prod checks; FAIL-path drill
  was proven run #184; prod dump landed this morning. VERIFIED.

## Recent-commit tech-debt audit
Last 12 commits: 3 feature/fix PRs (#208/#209/#210) + docs — no fix:feat regression, no bare
returns or console.* introduced. Hex baseline flat at 338 (audit clean today).

## Findings feeding this cycle (Reviewer A run #185)
- IMPORTANT: `leave-conversation` (app.gateway.ts:966) skips `isUuidShape` — last WS handler
  without shape validation; garbage room names possible. → Item 1.
- IMPORTANT: settlements `pay`/`generate` carry no route-level throttle (global 60/min only;
  wallet POSTs run explicit 10/min). → Item 2 (with wallet balance/history explicit 60/min).
- Reviewer B product gap: hosts get no payout line-item receipt (P2-293) — PRIZE ledger row
  exists but nothing inspectable. → Item 3 (user-visible).

## Recommendation
Proceed to build all three items (two hardening micro-slices + one user-visible money-truth
slice). No owner calls needed; nothing enters Defaults+48h-veto.
