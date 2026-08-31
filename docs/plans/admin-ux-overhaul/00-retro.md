# Run: Admin & Partner Console UX Overhaul — Gate 0 Retrospective

**Baseline:** `e36f647` (2026-08-31). Scope trigger: Abdullah's UX review of apps/admin (2026-08-31).
**Pre-flight:** gh auth ✅ (Abdullah-Alholiel), node v22.23.2 / npm 12.0.2 ✅.
**Tree note:** sibling off-schedule session WIP in tree (modular DatePicker refactor run #21b:
`DatePicker.tsx`, `RescheduleSheet.test.tsx`, new `DatePicker.test.tsx`, harness docs, `.gitignore .worktrees`).
No `kanban/LOCK.json` → no active run. **This cycle stages only its own paths.**

## Commit pattern (last 25)
fix:feat ≈ 12:13 — healthy. Recent fixes are contract/lifecycle hardening (money guards, row locks),
not reactive churn. No bare-row regressions found in `apps/api/src/modules/admin/`.

## Findings (user-confirmed + verified in code)

| # | Finding | Class | Evidence |
|---|---------|-------|----------|
| F1 | **Admin sees partner tabs.** `SECTION_BY_ROLE.Admin` includes all 6 `partner.*` sections; Sidebar renders them as a group. | CRITICAL (product) | `apps/admin/src/lib/rbac.ts:44-49`, `Sidebar.tsx:96-103` |
| F2 | **Admin has no Pitches tab.** No `pitches` ConsoleSection, no `/pitches` page, no `/admin/pitches` API. Admin cannot see or fix pitch data at HQ level. | CRITICAL (gap) | `rbac.ts`, `apps/api/src/modules/admin/` (no pitches controller) |
| F3 | **Missing admin edit powers.** `admin/matches` has only `POST :id/cancel` — no rename/edit. `admin/venues` has no ownership transfer (external "change owner" requests are unfulfillable). | CRITICAL (gap) | `admin/matches.controller.ts`, `admin/venues.controller.ts` |
| F4 | **Disputes/reports dead-end after decision.** Only `POST :id/resolve` exists; UI shows a static "This dispute has been resolved." panel. No reopen, no note edit. `DisputeStatus` even has an unused `under_review` value. | CRITICAL (gap) | `admin/disputes.service.ts:79-81`, `disputes/[id]/page.tsx:191-192` |
| F5 | **RTL not native.** `<html dir>` IS flipped pre-hydration (boot script ✅), but the shell uses physical CSS: sidebar `fixed left-0`, layout `pl-64`. Nothing mirrors in Arabic. Detail pages (disputes/reports) are 100% hardcoded English — Arabic toggle translates nothing there. | CRITICAL (RTL debt) | `layout.tsx:51`, `Sidebar.tsx:81`, both `[id]/page.tsx` (no `useTranslations`) |
| F6 | **Partner dashboard thin.** 4 metrics + one day-table + deposits list. No trend, no upcoming-match list, no quick actions. | IMPORTANT | `partner/page.tsx` |
| F7 | **Weak forms.** Placeholder-only inputs (no labels), inline edit panels that shift page content (venues, pitches), add-pitch form = bare grid of inputs, no validation surface, no preview. | IMPORTANT | `partner/venues/page.tsx`, `EditPitchSheet.tsx`, `partner/pitches/page.tsx` |
| F8 | **Schedule manager is an inline accordion.** Opens "at top of screen", closes only via the same button relabeled "Close schedule". | IMPORTANT (UX) | `partner/pitches/page.tsx:181-189,231-241` |

## Gate-0 checklist sweep
- Bare-row mutation returns: admin services return `findOne()` / populated objects ✅ (no new debt)
- Hardcoded strings without i18n: **FOUND** — disputes & reports detail pages (F5) → must be fixed this cycle
- Dead UI: none found beyond F4's static panel (all buttons wired)
- Stale tests referencing removed fields: N/A (no removals)

## Recommendation
Proceed to Gate 1. F1–F5 are blocking quality issues on the operations surface; the kanban board
already tracks "P1-12 admin i18n visual RTL check — needs Abdullah's eyes" — this cycle builds the
RTL-native shell that check was waiting for.
