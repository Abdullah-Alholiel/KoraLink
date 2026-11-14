# Run #128 — Gate 0 Retro (PWA lane, 128%4=0)

Scope audited: apps/player-pwa screens (feed/venue/match-detail/host/chat/profile) + DECISIONS.md.

## DECISIONS.md check (Gate-0 supremacy)
Read first — no entry contradicts this cycle. Error-copy standard (what/why/next, EN+AR)
directly drives the retry fix; EN+AR parity is standing doctrine (Marketing: EN+AR always).

## Prior-run state
- Run #127 claims both VERIFIED this run (P2-179 index live + EXPLAIN Index Scan Backward +
  journal idx51 + Rule-3 doc; P2-184 http ACAO echo live, https intact, bogus rejected) → DONE.
- Sentry triage: zero NEW signatures; KORALINK-API-B (+2 = this run's own CORS probes).

## Reviewer findings this run (evidence-cited)
- Reviewer A: all 8 standing bug classes CLEAN (2 MINOR acceptable: useOnlineStatus initial
  true, ErrorBoundary console.error-by-design).
- Reviewer B: no P0. 3 P1: (1) amenity codes render raw English on club page in BOTH locales
  (clubs/[id]/page.tsx:391 — verified: zero amenity.* i18n keys; live DB universe = 7 codes,
  prayer_room also icon-less on EN); (2) pitch cards static (product-shaped — NOT built,
  boarded instead); (3) DM error dead-end, no retry (messages/[id]/page.tsx:184-188 — verified
  vs Play's canonical retry pattern :250-255).

## Fix:feat ratio & debt
Recent runs healthy (review fixes ride PR flow). No new debt introduced this cycle.

## ADMIN STATE CHECK
Not an admin cycle; tree clean, no admin-area item picked.

## Decision
Build the two verified PWA parity/UX fixes as P2-187 (amenity labels) + P2-188 (DM retry).
Board the rest of Reviewer B's P2s (RTL arrow mirrors, Latin-digit stats, share-text i18n,
date-locale bypasses) as one consolidated P2-189 row — polish, not this run's build.
