# Run #98 — Program Design (Gates 1-3 compact)

Cycle: **P2-141 admin write-path concurrency hardening** (API lane inside an Admin-lane run; the four defect sites are `apps/api/src/modules/admin/*`).

## Problem (user story)
As an HQ admin, when I edit/reschedule a match, transfer a venue, or resolve a report with a ban, a concurrent host/player/admin action must never be silently overwritten or half-applied. Today four admin write paths can race: a finished match can have its schedule/metadata rewritten (admin update vs host cancel/complete); two concurrent admin reschedules can both pass the overlap check and double-book a pitch; a venue can be transferred to a user who was just demoted/banned; a report can end up `resolved` with the subject never banned (ban write fails after the status flip commits).

## Scope
IN: the four sites in `apps/api/src/modules/admin/{matches,venues,reports,settlements}.service.ts` + a new concurrency spec. OUT: settlements.generatePending() behavior change (board decision: aggregation deferral acceptable; comment-only rider), UI changes, partner/* services, any money-path service.

## Architecture delta
Apply the P2-139 house pattern (no new modules, no schema/migration changes):
- `matches.update()`: single `db.transaction` — locked read (`.for('update')`) → all validations against the locked row (status, schedule-mode, future-time) → overlap COUNT inside the tx → predicated UPDATE (`and(eq(id), inArray(status,['Open','InProgress']))`) → 409 `ConflictException('Match was concurrently updated — re-check its status.')` on zero rows. `findOne` before/after + audit stay OUTSIDE the tx (mutation-return contract §2).
- `venues.transferOwnership()`: single tx — venue row `.for('update')` (404 when missing) → target user row `.for('update')` → same-owner + `role === 'VenueOwner'` checks against the LOCKED user → venue UPDATE in-tx. Audit/findOne outside.
- `reports.resolve()`: existing predicated flip + 409 kept verbatim; banSubject leg wrapped — on ban failure, status-predicated revert of the flip (`resolved_by`/`resolved_at` → null) then `ConflictException('Report resolved but the ban failed — report reverted, retry.')`. adminUsers.update keeps its own tx (not nested).
- `settlements.generatePending()`: comment-only (documents the intentional out-of-tx aggregation).

## Exact contracts (Gate 3 checklist — verified against source before lane dispatch)
- [✓] No new endpoints; request/response shapes unchanged — zero frontend impact.
- [✓] Error-contract deltas (documented): admin matches.update may now 409 (`Match was concurrently updated — re-check its status.`) where it previously raced silently; venues.transferOwnership 404/400 texts unchanged; reports.resolve may 409 with the new ban-failed message.
- [✓] Admin console surfaces already render ConflictException message bodies via LoadError (what-happened-why-next standard) — no i18n keys needed (admin API errors are English-by-design today).
- [✓] Lock ordering: matches.update locks only `matches` row; transferOwnership locks `venues` row then `users` row (leaf-first: no path locks users→venues, so no lock-order inversion vs users.service's users-row locks).
- [✓] TS signatures unchanged (same method names/args/return types).
- [✓] Tests: new `admin-write-concurrency.spec.ts` in the established admin jest-mock style covering: update() 409-on-zero-rows, update() 404-when-missing, update() status predicate present, transferOwnership() 400-on-non-owner, resolve() ban-fail revert+409, resolve() existing zero-rows 409 kept.

## Verification gates (Gate 4 exit)
`npx turbo run build --concurrency=1` 3/3 · `cd apps/api && npx jest` (new spec green, full suite 0 fail) · `npx tsc --noEmit -p apps/api/tsconfig.json` 0 errors · PWA vitest untouched-area proof · PR-Agent triage to convergence before squash.

## Risks
- Spec-style drift vs existing admin mocks → mitigated: lane instructed to follow disputes.service.spec.ts/dto-caps.spec.ts patterns; parent re-verifies with real gates.
- Jest fake-timers vs `new Date()` in update() future-check → existing specs already handle; not touched.

## Lane decision (Phase 3.6, mandatory line)
Preconditions ALL true (claude auth pro; zeroshot 10.7.0; vertical-sized; admin tree CLEAN — no hold; no live-DB dependency). → **lane: used `01a10153-b7bb-7990-9e43-ff49c472d1ac`** (dispatched 10:26Z from /tmp/lane98-p2141-10203a, branch lane/run98-p2141).
