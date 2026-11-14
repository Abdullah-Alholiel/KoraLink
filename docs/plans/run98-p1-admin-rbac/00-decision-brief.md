# Run #98 — P1 Decision Brief: AdminAuthGuard fine-grained RBAC

Card: t_5f077dcb (Reviewer B, run #98). Status: **decision requested — no build.**

## The finding, verified

1. `apps/api/src/common/guards/admin-auth.guard.ts:24` — single check: `user.role !== 'Admin'`
   → ForbiddenException. No per-action granularity. TRUE as reported.
2. `apps/admin/src/lib/rbac.ts:91-94` — `can()` is client-side only. TRUE, but **by design**:
   the docstring and the run-#90 program design
   (`docs/plans/run90-p2-106-rbac-action-gates/01-program-design.md`) both state the API remains
   the security boundary; `can()` exists so users never see a button that will 403. Run #90
   explicitly scoped backend changes OUT. Reviewer B's frontend sub-point is already-closed
   design intent, not a defect.
3. Role model (`schema.ts:36-40`): exactly three roles — `Player`, `VenueOwner`, `Admin`.
   No staff/support role exists in the enum, in seed data, or on the roadmap docs.
4. Live staging counts (queried 2026-10-03): **Admin 1, VenueOwner 1, Player 24.**
   There is exactly one operator. Nobody is over- or under-privileged today.
5. Guard attach points: 26 usages across the 10 `modules/admin/*.controller.ts` — all are
   admin-surface endpoints, so all-or-nothing is currently *exactly* the correct policy.
6. The generic extension point already exists: `common/guards/roles.guard.ts` +
   `@Roles()` decorator (in production use at `partner.controller.ts:34` → `@Roles('VenueOwner')`).

## Analysis (analyst before architect)

- The specific question: does the coarse guard create a real access-control gap today? **No.**
  With one privileged role, one admin user, and 26/26 admin endpoints genuinely admin-only,
  coarse == correct. Nothing is reachable that shouldn't be; nothing is blocked that shouldn't
  be.
- Simplest native mechanism: the existing `RolesGuard` + `@Roles()` metadata. Adding a future
  `Support` role = one enum-value migration + `@Roles('Support')` on the relevant controllers.
  The guard code itself would not even need to change.
- What the simple option provably cannot do: nothing that has a consumer today. Fine-grained
  RBAC (per-action permission tables, permission claims in the JWT, admin UI for grants) only
  matters when ≥2 distinct staff roles with different permissions exist. None does.

## Options

| Option | What | Cost | Verdict |
| --- | --- | --- | --- |
| A. Confirm by-design, document revisit trigger | No code. Card closes; trigger recorded below. | ~0 | **Recommended** |
| B. Prophylactic refactor: migrate 26 admin attach points to `JwtCookieAuthGuard + RolesGuard + @Roles('Admin')` | Pure churn, zero behavior change today; collision risk with live admin-frontend work (concurrent edits in apps/admin observed during this run) | Medium | Rejected — no consumer |
| C. Full permission-table RBAC (permissions column + claims + grant UI) | Schema + migration + token + seeding + console UI | High | Rejected — speculative |

## Recommendation

**Option A.** The guard is a deliberate single-role chokepoint, and `RolesGuard`/`@Roles` is the
documented, already-used upgrade path. Abdullah's standing rule applies: no self-imposed
constraint may create a dependency, and there is no consumer for fine-grained RBAC.

**Revisit trigger (write this into the ticket that hires the first staff role):** the moment a
second staff role enters `UserRole` — (1) add the enum value via migration, (2) consolidate on
`RolesGuard` + `@Roles()` as the single enforcement mechanism (retire `AdminAuthGuard` or make
it a thin wrapper over `RolesGuard` — two role-check mechanisms is the one genuine smell found),
(3) extend `SECTION_BY_ROLE`/`ACTIONS_BY_ROLE` in `apps/admin/src/lib/rbac.ts` and the JWT role
claim issuance in `AuthService.verifyOtp` accordingly.

**What would change my mind:** a concrete staff-role requirement (support-agent tier, read-only
auditor, venue-onboarding ops) appearing on the roadmap before any enum change.
