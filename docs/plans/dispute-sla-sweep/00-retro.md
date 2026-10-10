# Retrospective — run #118 (dispute SLA sweep + reviewer fixes)

**Baseline:** e86a3b2 (run #117, P1-55 reviews + P2-51 migrate chain).
**Gate:** 0 complete 2026-10-10T02:0xZ. Mode: autonomous (cron).

## Recent commit pattern
2ec20b9 (feat venues reviews) → 6321771 (feat infra migrate) → e86a3b2 (docs).
fix:feat ratio last 10 ≈ 0.3:1 — healthy, feature-led.

## Gate-0 audit of the target area (admin disputes)
- `disputes.service.ts` resolve/reopen: status-predicated UPDATE inside ONE tx —
  race-safe (verified in source + spec). No `::uuid` casts. Audit trail content-free.
- **Reviewer A IMPORTANT #1** (:184-195): `resolve()` writes `audit.log` AFTER commit;
  if it throws, the no_show reversal is permanent but unaudited. Same post-commit shape
  in `addMessage` (:206) and `reopen` (~:290). → auditSafe() helper this run.
- **Reviewer A IMPORTANT #2** (:203-207): `activities.record` failure swallowed by bare
  `catch {}` — no Sentry signal. → capture + tag.
- **Reviewer A MINOR**: `scripts/migrate-vps.mjs` — when no env vars AND no apps/api/.env,
  `readFileSync` throws a raw stack instead of the fail-loud exit 5 (P2-51 pre-deploy
  contract on a Render cold misconfig). → try/catch → undefined → existing exit-5 branch.
- No cron sweeps disputes today (only matches/users/notifications schedulers).

## Sentry / error-log triage (Phase 1.6)
- koralink-api issue KORALINK-API-1M "Failed query" (GET /venues/favorites, PG 42883
  `vf.created_at` GROUP BY) — count 2, first=last 2026-10-07T02:04Z. VERDICT: STALE —
  the broken SQL was PR #92's intermediate; the fix (GROUP BY v.id, u.id, vf.created_at)
  is in fbdb8f2 itself, present in HEAD + live dist (rebuilt Oct 9 16:02Z, restart 16:16Z).
  Live probe this run: GET /venues/favorites → 200 bare array. No action.
- journalctl 5h: zero errors on api/pwa/admin. koralink-web: old viewport-diagnostic
  (count 54, last seen Oct 5) — known, boarded previously, MINOR noise.

## In_review verification (claims ≠ facts) — run #117 items
- P1-55: **VERIFIED DONE** — live: verified POST 201 (id 63be8005…), upsert same-id
  latest-wins (201, count stayed 1, aggregates 5→4), rating 6→400, 501-char→400,
  guest 401, unverified 403 (both seed users), unknown venue 404, can_review
  true/false per booking history. Reviewer B independent read: all CONFIRMED.
- P2-51 repo half: **VERIFIED** — bogus `DATABASE_URL` attempts THAT target
  (ECONNREFUSED 127.0.0.1:59999, no silent .env fallback). Note: conn-refused exits 1
  (uncaught), exit 5 reserved for gap/no-URL/failed-file — still fail-loud, contract
  holds. Remaining = owner-only Render dashboard toggle (P1 surface again).

## Admin state check (P1-63 touches admin surface)
apps/admin + apps/api/src/modules/{admin,partner}: tree CLEAN; portal active; last
admin commits are factory PRs (#103, #102, #98). NO HOLD. Disputes module = matches
module + admin module; both factory-owned.

## DECISIONS.md (read FIRST)
No contradicting standard. P1-63's 7-day default was clocked run #109 (2026-10-07T02:3xZ),
elapsed 2026-10-09 ~02:30Z, zero veto in chat/board as of this run → buildable per the
Defaults+48h-Veto register. Not on the owner-only list (not PSP/keys/promote/PDPL/RBAC).

## Findings → board (Reviewer B product gaps, boarded this run)
P1-64 recurring matches · P1-65 partner revenue view · P2-169 offline queued writes ·
P2-170 top-rated venue sort · P2-171 referrals/invite loop.

## Verdict: proceed to Gates 1-3 (compact, 01-program-design.md).
