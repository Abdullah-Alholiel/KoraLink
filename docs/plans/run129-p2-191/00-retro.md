# Run #129 — Gate 0 Retro (P2-191 lane)

**Baseline:** f9937fb..HEAD (271015a), staging, clean tree at 15:18Z.

## What the reviewers found (GLM 5.3 Flash ×2, parallel, 249s)

### Reviewer A (API code-quality + security lens)
- 0 CRITICAL. 2 IMPORTANT → **P2-191**: `admin/disputes.service.ts:374` and
  `admin/reports.service.ts:258` — `update()` methods write decision/internal_note
  (resp. resolution) with `WHERE id` only, outside any tx, no status predicate, no
  row lock. A concurrent `resolve()`/`reopen()` between the `findOne` read and the
  write is clobbered silently, and the audit `before/after` pair mis-records it.
- 1 hex flag: `match-fees.ts` imports @nestjs/drizzle — **NOT drift**: exceptions-
  in-services is the standing AGENTS.md §1.2 baseline; hex-audit.mjs reports clean
  (11/11 metrics at baseline). Recorded, no action.
- 2 hedges (reschedule slot lock, leave-lobby emit) — **parent-refuted**: both
  createMatch (:2115→:2186) and reschedule (:2399→:2449) take `FOR UPDATE` on the
  slot before the `is_booked=true` write; leave-lobby is deliberately un-gated
  (documented P2-6 rationale in app.gateway.ts:323-328) and emits no fan-out.
- Standing sweeps: ::uuid 0, eq(col,null) 0, console.* 0, ILIKE all escaped, WS
  handlers carry REST-parity auth+membership checks. Money/state paths strong.

### Reviewer B (product gaps + verification)
- Run #128 claims **VERIFIED TRUE** (P2-187 amenity keys 10/10 EN+AR, labels on both
  club surfaces, prayer_room icon; P2-188 Retry→refetch + common.retry both locales).
- i18n parity: 0 key drift EN↔AR.
- P0 gap: refund events are silent in-app (money surface) — **parked**: money-path,
  gated on P0-2 PSP owner decision (DECISIONS.md ledger row 1).
- P1: OTP resend-cooldown contract, dispute-status tracking surface, email no-op
  (P1-41), lobby backfill, slot-hold UX — boarded as P2-192..P2-196 candidates, all
  below the security fix in priority.

## Phase 1.8 (FIX-before-HUNT)
Audit run-3 has 3 confirmed-unfixed LOWs. Parent re-verified each:
1. `api-auth:dev-login-throttle` — **REAL** (auth.controller.ts:130 has no
   @Throttle; send-otp precedent at :53). Fixing this run.
2. `api-auth:bearer-extractor` — **refuted-by-design**: cookie-only premise is
   stale; fetcher.ts:50,99 documents Bearer as the cross-origin Tailscale path
   (SameSite cookies don't travel). No action; audit record annotated.
3. `api-auth:partner-admin-roles` — **owner-decided**: @Roles('VenueOwner') 403s
   admin per Abdullah 2026-08-31 (partner.controller.ts:24-33 comment). No action.

## Selection decision
- Primary build: **P2-191** (both admin update() race fixes + tests) — security/
  data-integrity class, beats product rows per Phase 3.5 rank order.
- Plus the audit fix (dev-login throttle, 1 line) — same PR, FIX-before-HUNT duty.
- No admin-tree state conflict: tree clean, no in-flight admin work (checked 15:19Z).
