# Gate 0 — Retro (run #111)

Area touched: venues favorites API (run #109/#110) + clubs page + profile menu.

## Recent-commit pattern
`git log -8`: feat(pwa) favorites error state (PR #93) → feat(venues) favorites (PR #92) → docs.
fix:feat ratio healthy (2 fixes / 4 feats over the last six code commits) — no reactive loop.

## Findings
1. **IMPORTANT (Reviewer A, parent-verified): `addFavorite` TOCTOU** — venues.service.ts:359-372
   runs the `is_approved` existence check and the insert as two independent statements.
   A venue unapproved between them strands an orphan favorite row that BOTH list queries
   (which join `venues.is_approved = true`) will never return → invisible stuck heart state.
   Not money-touching, but a silent data-integrity hole in a fresh feature → fix this run.
2. **MINOR: ids-list ordering** omits the `v.name` tiebreaker that `listFavoriteVenues` has —
   ids and list can disagree on tie order. One-line alignment, same file, rides slice 1.
3. **MINOR (run #110 follow-up, confirmed live by Reviewer B): guest favorites dead-end** —
   favorites tab empty state tells a signed-out user "you have no favorites yet" with no
   sign-in affordance, and the heart is inert for them. Clears with slice 2.
4. Reviewer A remaining MINORs (row-shape type share, toggle double-tap desync, pathname
   locale parse) — recorded, not buildable in budget; double-tap is server-idempotent.

## DECISIONS.md check (Gate-0 supremacy)
No design/UX change in this cycle contradicts the ledger: Drawer untouched, no bell, EN+AR
copy standard respected, MenuItem reuses the shared component (P2-133 pattern).

## Admin-state check
NOT an admin item (PWA + venues API only). Tree clean on apps/admin anyway (verified 15:20Z).

## Verdict: proceed to Gate 4 (compact Gates 1-3 in 01-program-design.md).
