# Run #81 — Gate 0 Retro: API lock-discipline (P2-118)

**Cycle:** run81-api-lock-discipline · **Lane:** API modules (rotation 81%4=1, SECURITY LENS) · **Date:** 2026-09-27

## Area audit (what we're about to touch)

Recent commits in scope:
- `878951a` (PR #41) — PWA a11y labels batch (run #80). No API impact.
- `6c3a7aa` (PR #40) — last-admin guard TOCTOU fix: guard AND write in ONE tx, living-admin rows
  FOR UPDATE. House pattern for admin-protective mutations now = tx + row lock + guarded write.
- Earlier: `0638b06` (dto-caps), `3ea4a30` (P2-49 close: startMatch/completeMatch locked).

fix:feat ratio last 15 commits: mostly fixes/pins — the codebase is in a hardening phase, consistent
with the security-lens rotation. No reactive fix loop.

## Findings that shape this cycle (Reviewer A, deleg_a64bc47c task-0, 302s, zai glm-5.3-flash)

**0 CRITICAL.** Money paths verified holding (wallet recordTransaction, admin refund, host-payout /
refund-join ledger keys, settlement conditional pay, dispute resolve, last-admin guard).

**3 IMPORTANT — one defect class: check-then-act without the house tx+lock discipline:**
1. `matches.service.ts:3172-3181` (markNoShow): match row selected inside the tx **without**
   `.for('update')` — every sibling mutation (join/leave/remove/start/complete/cancel/reschedule)
   locks the matches row first (pinned by `matches.join-leave-lock.spec.ts`). Status + grace-window
   checks can race a concurrent completeMatch; writes are idempotent flag flips, so impact is low —
   but the lock is the established pattern.
2. `matches.service.ts:3682-3761` (castVote): voting-window + roster checks run against a
   non-locked row OUTSIDE any tx; the vote upsert lands after. A vote can be recorded against
   state a concurrent completeMatch/markNoShow is flipping (stale-state vote). Unique
   (match_id, voter_id) blocks double-vote only.
3. `partner.service.ts:193` (updateVenue) + `:475` (updatePitch): ownership checked in a separate
   read, UPDATE WHERE matches only `id`. An admin `transferOwnership` (admin/venues.service.ts:216)
   between check and write makes the previous owner's write land cross-tenant. Sibling
   `deletePitch:496-502` shows the house tx+lock pattern; for metadata updates the scoped-WHERE
   UPDATE (owner_id folded into the predicate + 0-rows → 403) is the correct fix because the
   transfer locks the venues row, not the pitches row.

**Standing bug-class sweep CLEAN** (::uuid casts 0, eq(col,null) 0, console.* 0, spots-count FILTER
exclusion 0). Reviewer B (task-1, 151s): all 5 run-#80 claims verified TRUE at exact file:line,
i18n parity 990/990 re-counted. Its match-detail "degraded state" IMPORTANT was **downgraded to
MINOR by parent verification** — the error path exists at `match/[id]/page.tsx:250`
(`error && !isLoading && !match`), and stripped-relation renders are FK-backed hypotheticals.

## ADMIN STATE CHECK (step-0, mandatory — item touches partner API surface)

- `git status` on apps/admin + apps/api/src/modules/partner + admin*: **CLEAN** — no hold.
- `git log -12 -- apps/admin`: last touch 37b3c77 (P2-104, merged PR #38) — no in-flight drift.
- `koralink-admin.service`: active. `(dashboard)` route group present as expected.
→ Partner-module work allowed this run.

## Tech debt noted (not this cycle)

- Reviewer A MINORs: waitlist.service.ts:204 + users.service.ts:635 return `{message}` (tolerated —
  no row exists to return; documented for completeness).
- Reviewer B residual: match-detail page has no distinct empty-state for hypothetically stripped
  relations (MINOR; PWA lane, needs product eyes before any build).
- PR-Agent minors on P2-116 already documented on the board row — not re-boarded.

**Gate 0 verdict: proceed to Gate 1** — build P2-118 (batch of the 3 IMPORTANTs, one defect class,
~13 new spec cases, vertical slice: service + specs only, no schema/UI churn).
