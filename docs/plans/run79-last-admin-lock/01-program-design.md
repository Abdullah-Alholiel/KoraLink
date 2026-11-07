# Run #79 — P2-116 — Program Design (Gates 1-3 compact)

## Problem / user story (Gate 1)
As the platform owner, I must never be able to demote/ban the final living admin —
not even under concurrency. Today two simultaneous demotes of the last two admins
both succeed (plain count-then-write, no lock), leaving zero admins: every ops
surface locks out with no self-service recovery. P1 severity by blast radius, small
surface.

## Scope
IN: transactional guard (lock + recount) in `AdminUsersService.update`; jest spec
pinning lock shape + order + refusal; API only.
OUT: admin UI changes, other moderation paths (reports/disputes bans route through
different services — flagged for a follow-up sweep only if a shared helper
extracts), schema/migrations (none needed).

## Architecture delta (Gate 2)
Single method change in `apps/api/src/modules/admin/users.service.ts` `update()`:
wrap the existing last-admin count in `this.db.transaction`, preceded by a raw
`SELECT id ... FOR UPDATE` over the LIVING-admin predicate (ORDER BY id —
deterministic lock order, mirrors rescheduleMatch slot locks). Guard still fires
only for Admin-targeting demote/ban mutations (before.role === 'Admin' && (role
change off Admin || banned === true)). Non-admin path unchanged.

## Contracts (Gate 3 — exact shapes)
- Method signature unchanged: `update(id, dto: UpdateUserAdminDto, adminId, ip?)`.
- Success response unchanged: populated `findOne(id)` AFTER (outside) the tx —
  the audit `before`/`after` rows are read outside the guard tx (reads committed
  state; matches the findOne-outside-tx rule).
- Error contract unchanged: `400 BadRequestException('Cannot demote or ban the
  last active admin account.')` — now raised after the tx returns the violation
  flag (no exception escaping the tx callback; the tx commits nothing — it only
  reads/locks, so commit vs rollback is immaterial; the lock releases at
  boundary either way).
- Frontend: zero contract change (same 400 message the admin UI already maps).
- i18n: none (backend message; admin surfaces map errors generically).

### Gate 3 checklist
- [x] Mutation still returns fully populated object (findOne outside tx) — verified in code read.
- [x] No frontend type consumes anything new — zero FE change.
- [x] Adapter/hook: n/a (no FE change).
- [x] i18n keys: none needed (no new user-facing copy).
- [x] No migration (no schema change) — Phase 4.5 sweep expects clean drizzle/.

## Verification plan (Gate 4)
1. Slice 1 (tracer): tx + lock + recount lands with 4-case spec; spec RED-proven
   against old guard (stash dance — FOR UPDATE case fails pre-fix).
2. Gates: `npx turbo run build --concurrency=1` (root, sequential) zero errors;
   full api jest; PWA vitest untouched-but-green.
3. Ship via PR lane (#40) → bot checks (gate/semgrep/pr-agent) → squash to staging.
