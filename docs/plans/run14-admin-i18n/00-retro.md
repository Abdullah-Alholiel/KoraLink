# Gate 0 — Retrospective (run #14, area: apps/admin + PWA i18n patterns)

## Recent commits touching this area
- `9f3b7c2` (run #9): P2-21 apiFetch 403-vs-401 fix — admin error UX consolidated into
  thrown Errors; API messages surfaced verbatim (see P2-24 follow-up from Reviewer A this
  run: empty-body parse + no timeout).
- `d93e1ea` (run #3): P1-6 partner-portal Admin scope — `actorRole` threading established.
- No i18n layer has EVER existed in apps/admin (board P1-12 since run #2).

## Contract audit
- No API changes in this cycle; all contracts client-side. The admin `apiFetch` success
  path (`res.json()` unconditional, api.ts:62) is the only server-consumption point in the
  slice and is unchanged this run (P2-24 boards the fragility).
- PWA precedent (`koralink-frontend-patterns`): option maps separate wire value from label;
  `MISSING_MESSAGE` is a runtime-only failure → key-parity script required in verification.
- Admin has no test runner → gates are tsc + build + grep + live screenshot (recorded in
  the program design; next-from-scratch if tests are added later).

## Tech debt observed (not repaired this run — boarded)
- P2-24 apiFetch empty-body/timeout (Reviewer A, run #14).
- P1-26 partner console has no match/roster visibility (Reviewer B, run #14) — the natural
  NEXT admin slice after i18n, since it touches the same pages.
- HQ console strings still English (descoped follow-up on P1-12).

## Fix:feat ratio
Recent 15 commits: ~4 fix / ~6 feat / rest docs+kanban — healthy, no reactive loop.

## Verdict
Proceed to Gate 4 with the partner-portal slice. The slice reuses the PWA's proven i18n
catalog shape (namespaced JSON, both locales always in the same commit) — zero new patterns
invented, matching the factory's "extend, don't replace" rule.
