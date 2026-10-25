# Run #163 — Gate 0 Retro: settlement money paths (P2-216 package) + DB/Infra lane

**Cycle focus:** 163 % 4 = 3 → DB & Infra (schema, migrations, indexes, seed, CSP, CORS, systemd, SW).
**Item picked:** P2-216 settlement-window package (money-path) + P2-221 fold (JS-float success total)
+ P2-209 residue (earnings totals float-reduce + revenueToday UTC axis — PR #141 was CLOSED unmerged
in the owner's Oct-23 purge, so its fixes never landed; board row was stale).

## DECISIONS.md check (ledger supremacy)
Read first. No design/UX change in this cycle touches a ledger entry (API-only money-path
correctness; no Drawer/menu/marketing surface). No default+48h-veto row is being built.

## Premise corrections found at Gate 0 (board hygiene)
1. **P2-216 "blocked by open PR #141" is STALE** — `gh pr view 141`: CLOSED 2026-10-23T15:22Z
   (owner queue purge), never merged. Files are free; the row's blocker premise is void.
2. **P2-209 row still says "BUILT (run #138, IN-REVIEW — PR #141 bb1411c)"** — STALE: the PR was
   purged unmerged, so (1) revenueToday Riyadh idiom and (2) getEarnings SQL-SUM totals never
   landed. Re-verified against live code: partner.service.ts:484 still `date_trunc(day) = CURRENT_DATE`
   (UTC axis) and :822-827 still JS-float reduces. P2-209's residue is folded into THIS package.

## Live-code audit of the exact area (all evidence fresh this run)
- `settlements.service.ts generatePending` (:184-249): revenue SELECT runs on `this.db` OUTSIDE the
  tx → check-vs-insert TOCTOU vs the partner path (partner locks venues FIRST; generator doesn't);
  no venue lock; period bounds UTC (`windowStartIso.slice(0,10)` / `toISOString().slice(0,10)`).
- `partner.service.ts requestPayout` (:185-290): venue `.for('update')` with NO `orderBy` (multi-row
  lock — deadlock candidate across concurrent generate/request with different lock orders);
  Riyadh upper bound rides server-side `CURRENT_DATE` (assumes DB server timezone);
  totalAmount via `reduce((acc, s) => acc + Number(s.amount), 0).toFixed(2)` (P2-4 violation, P2-221).
- `partner.service.ts getEarnings` (:822-827): totalPending/totalPaid JS-float reduces (P2-209 half 2).
- `partner.service.ts getDashboard` (:462/:484/:513) + `admin/pitches.service.ts` (:57/:59): 5 bare
  `CURRENT_DATE` sites — "today" drifts when the Postgres server is not on Riyadh time (P2-216 note +
  Reviewer A run-#163 standing sweep).
- Reviewer A run-#163 (92s, full report): confirmed all of the above independently + flagged the
  missing lock tiebreaker; verdict "planned direction sound", no CRITICAL found.
- Other 6 `.for('update')` sites in partner.service: all single-row `.limit(1)` — NOT touched
  (deadlock risk is only the multi-row site).

## Tech-debt classification
- CRITICAL: none.
- IMPORTANT: the 4 settlement defects above (money-source ambiguity + float path + TOCTOU + axis mix).
- MINOR (recorded, NOT preemptive per pickup-lane convention): audit entityId only created[0]
  (partner.service :288-298); getEarnings order-by without id tiebreaker (unbounded today).

## Fix:feat ratio / recent commits
Last 5: 2b885cc (docs), a9f663c (fix P2-252-2), 1ba97e5 (feat P2-253), a2ccdbd (docs), 0972a3a
(refactor P2-252-1). Healthy — docs-heavy but the code commits are review-driven fixes, no
reactive loop.

## Gate 0 → Gate 1 recommendation
PROCEED. The package is a correctness consolidation of two already-specced money paths, both with
established spec files; no schema change, no migration, no i18n, no UI.
