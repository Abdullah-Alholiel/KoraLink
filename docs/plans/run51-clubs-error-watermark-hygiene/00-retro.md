# Factory Run #51 — Gate 0 Retrospective (P1-46 + P2-62)

**Cycle areas:** clubs detail page (PWA), useMessages hook (PWA), ws (API — none touched).

## Scope contract
- Item 1: P1-46 — clubs/[id] drops `useMatches`' `error`/`refetch` (page :103 destructure-only, :350 renders
  empty state on fetch failure → "no games" lie). Fix = error branch + localized retry, per the
  error-message standard. Mirrors the venue-error block (:150) and the Play feed's 5-state pattern.
- Item 2: P2-62 — `markedReadIdsRef` (useMessages.ts:219) never cleared on match switch — unbounded
  Set growth within a session, shared lifecycle with no reset. Reviewer A (run #51) finding.
- P2-57 (SWR/offline fallback recipes) NOT expanded: owner's PWA-first scope boundary holds; only
  new P2-62 row + evidence annotation on P2-57.

## Audit findings (evidence-cited)
- `useMatches.ts:63,158` — `error`/`isError`/`refetch` all returned; page :103 took only
  `matches, isLoading`. Confirmed the boarded premise. (Reviewer B I-1, run #50.)
- clubs/[id] `useVenue` error block (:150-156) = the in-page pattern to mirror (AlertTriangle +
  clubs.error + centered column).
- i18n: ZERO new keys — `errors.*` (9 kinds, EN+AR authored 2026-09-06 cycle) + `common.retry`
  ("Try Again"/"حاول مرة أخرى") + `clubs.error` exist with full parity. classifyError → ERROR_KEYS
  map is the standard classifier (lib/error-classify.ts:16-25).
- Play feed compliant pattern: `error && !isLoading` → `common.error`/`common.errorDescription`
  (play/page.tsx:159-181).
- i18n location this run: `apps/player-pwa/src/messages/{en,ar}.json` (run #50 docs cited
  src/i18n/locales — stale path in docs, correct path re-verified live).

## Pre-existing debt noted (not this cycle)
- run #50 docs' i18n path drift (src/i18n/locales → src/messages) — corrected here in passing.
- P2-57 row's "handlerDidError fallback" — reviewer described NetworkFirst's fetch-failure branch;
  no code defect.

## fix:feat ratio
Run #50: 1 fix commit + 1 feat commit; run #49-50 review-verified lineage. No reactive fix loop.

## Gate 0 → Gate 1: PROCEED (autonomous mode, no approval pause)
