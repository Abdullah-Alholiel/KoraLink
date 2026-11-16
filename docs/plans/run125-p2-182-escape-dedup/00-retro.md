# Run #125 — P2-182 + stale-PDPL-rows closure

## Gate 0 — Retro (area: apps/api ILIKE sites + admin audit)

- Board rows P1-35/P1-36 (PDPL, run #31) verified ALREADY FIXED in code + specs — rows are
  stale, closed this run with evidence (see RUNS report). Premise-stale rule applied.
- P2-182 premise CONFIRMED live: `admin/audit.controller.ts:25` re-implements
  `escapeLikePattern` inline while the shared helper's own doc comment cites this file as the
  "reference pattern" (drift: the reference no longer uses the helper).
- Reviewer A sweep (run #125): all 9 ILIKE sites currently escape correctly; 0 CRITICAL /
  0 IMPORTANT findings. Standing bug classes clean (no ::uuid, no eq(col,null), no
  count-then-write gaps, no console.*).
- Ledger (DECISIONS.md) consulted: no design/UX change in this item; no conflicts.

## Gates 1-3 — Compact program design (P2-182)

- Problem: inline `dto.action.replace(/[\\%_]/g, ...)` duplicates
  `common/utils/escape-like.ts`. Two implementations of one security-adjacent normalization
  can drift (e.g. someone hardens the helper with `\u0000`/`[` handling and the audit filter
  silently keeps the old behavior).
- Fix: import + use `escapeLikePattern()` in audit.controller.ts; keep the explicit
  `ESCAPE '\\'` clause (helper contract).
- Tripwire: structural spec asserting no file under `apps/api/src` (outside the helper
  itself) re-implements the inline escape regex — the class of drift P2-182 pins shut.
- Contract verification:
  - [x] Behavior identical: same regex, same replacement, same `ESCAPE '\\'` clause.
  - [x] No API shape change (response rows/count untouched).
  - [x] No migration, no DTO change.
  - [x] i18n: none involved.

## Gate 4 — Slice

1. Patch controller → scoped jest (audit + escape-like coverage) → lane branch → PR →
   bot checks → squash-merge → merged-tree gates.
