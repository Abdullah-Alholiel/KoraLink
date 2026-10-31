# Run #90 — Gate 0 Retro (P2-106 rbac action gates)

**Rotation:** 90 % 4 = 2 → Admin console lane. **ADMIN STATE CHECK (step-0): CLEAN** —
`git status --short apps/admin apps/api/src/modules/partner` empty at 15:18Z; last admin commits
0a48eb8 (P2-124 hydration batch, #51) / 0ad16ec (P2-68 CSV export, #50); service active; 13
dashboard routes as expected. No owner WIP → admin items buildable.

## Pre-cycle audit (area: admin RBAC + this week's admin surface)

- `apps/admin/src/lib/rbac.ts` — `ConsoleAction` union (20 actions) + `ACTIONS_BY_ROLE` +
  `can(role, action)` exist and are correct, but **`can()` has ZERO call sites in the repo**
  (grep over src/app + src/components). The docstring invariant — "users never see a button that
  will 403" — is aspirational: layout-level `canAccessPath` gates ROUTES only (run #54-era), and
  per-ACTION affordances were never wired. P2-106 premise CONFIRMED (was flagged Reviewer-grep-only).
- Dispute detail (`(dashboard)/disputes/[id]/page.tsx`): resolve button block (:357-389) and
  reopen button (:338) render unconditionally → a demoted-to-VenueOwner/Player role (server-side
  change while session JWT still valid) keeps clickable buttons that 403. No owner call needed —
  API is the boundary; this is affordance hygiene.
- Settings page (`(dashboard)/settings/page.tsx`): PUT save button (:104) renders for any role
  that can reach the route (layout currently admits Admin-only to /settings, but the route guard
  is data-dependent on the JWT remaining valid; same 403-on-stale-role class).
- Run #86's P2-124 established the hydration-safe pattern for role-gated render: resolve role
  ONCE in a mount effect, hold in state, render a pure function of it. Reuse it here (getRole()
  reads localStorage → SSR-safe null seed + effect sync, never during render).
- Recent-commit debt scan: no fix:feat anomaly (last 12 admin commits are feature/fix pairs from
  reviewed PRs). Standing bug classes in the touched area: none (Reviewer A run #90 sweep clean).

## Reviewer intake this run (merged A+B, deleg_6e720ba7)

- Reviewer A: 0 CRITICAL / 0 IMPORTANT / 2 MINOR (SW-updater z-[60] vs InstallPrompt z-[70]
  overlap cosmetic; week.ts default-arg comment guard). Standing sweeps: 8/8 classes clean,
  i18n parity PWA 1007/1007 + admin 618/618.
- Reviewer B: run #89 claims 8/8 PASS (→ P2-126 DONE). Product-gap leads triaged:
  "no notification preference center" **STALE** (run #28 P0-5 built per-category push prefs UI);
  "no PWA settings hub" = real but polish-class (all surfaces exist: profile push toggles,
  personal-info fields, language toggle) → new **P2-133**; admin venue occupancy/calendar grid →
  new **P2-134** (backlog-class); partner payout surface claim LOW confidence → note only, not boarded.

## Verdict

Proceed to build P2-106 (S-size, vertical slice: rbac wiring on 2 pages + structure pin via
page-level gating + tsc/build gates). P2-133/P2-134 board-only this run.
