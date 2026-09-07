# 01 — Product Spec — Admin Table Restructure

## Problem
Every list in `apps/admin` renders a raw `<table>` (6–10 columns) inside `overflow-x-auto`.
On any narrow viewport (< ~700px) rows clip or demand horizontal scroll that hides half the
row — unreadable on a phone, which is how ops staff check things between matches.

## Goal
Adopt the reel's standard console-wide: **restructure, don't shrink.** Same component family on
every page; the table restructures itself into rows-that-read-as-units below the table's own
breakpoint, and the ID/detail/sort information moves — it is never deleted.

## Scope
**In:**
- 12 data tables: admin transactions, users, venues, matches, settlements, audit, disputes,
  reports, pitches; partner dashboard "today's schedule", partner matches, partner match roster,
  partner earnings.
- New shared components: `DataTable` (container-query shell), `DataCard` (restructured row),
  `RecordDrawer` (tap-for-details), `SortSelect` (server-side sort control).
- Server-side `sortBy` whitelist on the four value-bearing admin lists (transactions, users,
  matches, settlements) + partner matches list.
- Tabular figures for every numeric/amount cell; explicit labels on ambiguous timestamps.
- EN + AR i18n for every new string (parity gate must stay green).

**Out:**
- Drawers/side panels' open side (recent deliberate decision: physical right-0 both locales).
- Slot-manager grid tables (not entity lists). Partner venues page is already cards.
- Any write-endpoint or RBAC change; actions keep firing through the same API calls.

## Success criteria
1. Zero `overflow-x-auto` table wrappers left in `apps/admin` pages.
2. At 390px width every list renders as stacked cards: identity left, value top-right
   (tabular figures), labeled state line, no clipped text, no horizontal scroll.
3. Tap a row → drawer shows ID + details + row actions; actions still work (refund, ban,
   pay out, approve…).
4. Sort control refetches from the API with `sortBy` (verified in network tab), defaults preserved.
5. `turbo run build` zero errors; `tsc --noEmit` green; i18n parity en===ar.
6. Desktop ≥700px: the same table as today (visual parity), same page works in a side panel.
