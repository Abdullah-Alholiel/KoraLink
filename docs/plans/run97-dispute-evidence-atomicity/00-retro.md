# Run #97 — Gate 0 Retro: dispute evidence append atomicity (API lane, 97%4=1)

## Scope of this cycle
Reviewer A (zai glm-5.3-flash, 245s, deleg_e5cc3080 task-0) swept `apps/api/src/modules/**`
+ `common/**` for the 10 standing bug classes. Result: 0 CRITICAL, 1 buildable IMPORTANT,
4 MINOR. Wallet money internals explicitly PARKED (tag-only).

## Finding under build (IMPORTANT)
**Dispute appeal evidence lost-update race.**
- Player side: `matches.service.ts` `attachAppeal` (~:3557) — read evidence → JS push →
  `UPDATE disputes SET evidence WHERE eq(id)` with NO lock, NO status predicate.
  Two concurrent appeals (fast path vs winner path after `onConflictDoNothing`, or an
  appeal racing an admin close) silently drop one side's evidence entry.
- Admin side (same pattern, rider): `admin/disputes.service.ts` `reopen()` :207-229 —
  `findOne` → spread → `set({status:'opened', evidence})` with a status predicate
  (run #24 hardening) but no row lock → evidence read-modify-write can drop a player
  appeal appended between the read and the write.

## Admin state check (Phase 3.5 step 0)
`git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*`
→ CLEAN. `koralink-admin.service` active. Last admin-area commits: 279d507 (P2-106 RBAC
gating). → admin API surface touch is PERMITTED this run (rider only; no UI files).

## Existing guards verified in place (no re-litigation)
- Insert path: partial unique index `disputes_open_uidx` + `onConflictDoNothing` +
  winner re-read (run #8 idempotency) — unchanged by this cycle.
- `reopen` status predicate (run #24) — kept, lock ADDED.
- OTP store caps/mutex, WS gate coverage tripwire, zero `::uuid`/`eq(col,null)` —
  all re-confirmed clean by Reviewer A this run.

## Mock/tooling facts driving the design
- `matches.dispute-contract.spec.ts` + `matches.dispute-idempotency.spec.ts` hand-rolled
  db mocks have NO `transaction` support → mocks must gain `transaction: (fn) => fn(tx)`
  when the fix goes transactional (assertions otherwise unchanged).
- Admin service already uses `this.db.transaction` (3 sites) → reopen wrap is native.
- DTO rider: `create-match.dto.ts:64-66` `booking_slot_id` bare `@IsString()` —
  house convention (run #73, dto-caps.spec) = `@MaxLength(36)` + `@Matches(UUID_SHAPE)`
  imported from canonical `common/validation/id-shape`, never `@IsUUID`.

## Prior-cycle debt scan
Last 20 commits: review-fix/feat ratio healthy (tripwire #66, boundaries #67, docs).
No contract breaks found in the dispute area beyond the finding above.

## Decision
Proceed to Gate 1 with scope: [player attachAppeal atomic RMW] + [admin reopen lock rider]
+ [booking_slot_id DTO cap rider] + [mock upgrades + new concurrency spec + dto-caps block].
