# Cycle pdpl-hardening-31 — Gate 0 Retrospective (run #31)

**Date:** 2026-09-04 · **Mode:** autonomous · **Rotation focus:** run# % 4 = 3 → DB & Infra

## Areas audited
PDPL chain (users.service softDelete/restore/purge/export, jwt-cookie.strategy, app.gateway
handshake), admin users module, Sentry triage 24h, error logs.

## Inputs
- Reviewer A (glm-5.3-flash on opencode-go, 147s): PDPL chain + DB/Infra sweep.
- Reviewer B (glm-5.3-flash on opencode-go, 183s): product gaps + run #30 verification.
- Parent self-review: WS handshake audit, strategy/guard chain, admin UI state.

## Findings (evidence-cited)

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| A-C1 | CRITICAL | `purpose:'restore'` JWT bypasses the deleted-user gate on EVERY guarded route (full session-equivalent for up to 31d; post-purge ghost rows remain actable) | jwt-cookie.strategy.ts:96 |
| A-C2 | CRITICAL | `getPublicProfile` leaks soft-deleted users (0031 migration contract violation) | users.service.ts:422 |
| SELF-1 | CRITICAL | WS handshake never checks `deleted_at` — soft-deleted user keeps realtime chat/lobby access until token expiry (REST 401s, WS does not) | app.gateway.ts:118-145 (select lacks deleted_at) |
| A-I3 | IMPORTANT | Purge job never deletes `push_subscriptions` re-created during grace window (0031 docs say it should) | users.service.ts:905-925 |
| A-I4 | IMPORTANT | Idempotent re-delete re-signs restore token `31d from now` → expires 30d past purge_at | users.service.ts:533-542 |
| A-I5 | IMPORTANT | No spec coverage for the strategy restore gate or export redaction | (missing files) |
| A-M8 | MINOR | sw.js `/api/user` (singular) regex never matches `/api/users` routes | apps/player-pwa/public/sw.js |
| B-1..9 | notes | Money = P0-2 (parked); offline banner, purge audit log, moderation bulk-actions → P2 backlog | reviewer B report |

## Triage verdicts (Phase 1.6)
- KORALINK-API-Z (`column mp.joined_at does not exist`, 3 events, last 2026-09-03T10:49): code
  fixed 3 min later by a17755a (stripped from SELECT, comment users.service.ts:702-706); dist
  clean; live DB never had the column. **Closed — no action.**
- KORALINK-WEB-6 (viewport-diagnostic:standalone, 8 events): intentional diagnostic throw from
  c77cd37 collecting iPhone/iOS 18.7 ground truth. **Noise by design.**
- All other signatures: expected 4xx business-rule noise (CORS attacker.example rejections,
  invalid-cookie probes, duplicate-report guards).

## Fix:feat ratio
Last 15 commits: 4 fix / 8 feat / 3 docs — 0.5:1, healthy (no reactive loop).

## Decision
Proceed to Gate 1 with three PDPL hardening items (P1-35, P1-36+WS, P1-37) as one coherent
vertical: closed by run #30's recommendation, all buildable, no external deps. push_subscriptions
purge (A-I3) folded into the P1-36 slice (same purge function touched for tests). sw.js pattern
(A-M8) → P2 backlog, not this run.
