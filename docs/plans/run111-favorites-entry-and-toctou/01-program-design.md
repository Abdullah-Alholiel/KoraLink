# Gates 1-3 (compact) — Favorites entry point + TOCTOU fix

## Problem (Gate 1)
Favorites are only reachable via the clubs-page pill (P2-165). Users who forget it cannot
find saved clubs. Also: a guest tapping the Favorites pill sees "no favorites yet" with no
sign-in path, and `addFavorite` has a check/insert TOCTOU window.

## User story
As a signed-in player I open Profile → "My favorite clubs" and land on the clubs list with
the Favorites filter active. As a guest I tap Favorites and get a sign-in CTA instead of a
false "none yet".

## Scope
IN: clubs `?tab=favorites` deep-link; profile MenuItem; guest sign-in CTA in the favorites
empty state; i18n EN+AR; addFavorite tx wrap + ids ordering tiebreaker; tests.
OUT: new favorites page/route (filter deep-link, not duplicated state — P2-133 pattern);
favorites count badges; admin surfaces; other MINORs from review (documented).

## Contracts (Gate 3)
- No API shape changes: `GET /venues/favorites/ids: string[]`,
  `GET /venues/favorites: VenueApi[]`, `POST/DELETE /venues/:id/favorite` unchanged.
  addFavorite tx wrap is behavior-preserving (same 201/200/404 semantics, now atomic).
- Clubs page accepts `?tab=favorites` (initial state only; pill remains the runtime
  control — same as verify page's one-shot params). Any other/absent value = 'Nearby'.
- Profile row: `MenuItem` href `/{locale}/clubs?tab=favorites`, icon Heart,
  label `profile.myFavorites`, placed in the Playing section after My games.
- i18n (en/ar): `profile.myFavorites` ("My favorite clubs" / "أنديةي المفضلة"),
  `clubs.favoritesSignInTitle` ("Sign in to save your favorite clubs" /
  "سجّل الدخول لحفظ أنديةك المفضلة"), `clubs.favoritesSignInCta` ("Sign in" / "تسجيل الدخول").

## Verification checklist (Gate 3 → 4)
- [x] Mutation contract preserved (no shape change; atomicity added).
- [x] Frontend types unchanged — no adapter drift possible.
- [x] i18n keys exist in BOTH en.json and ar.json before build.
- [x] Deep-link is initial-state only (no bidirectional sync) — zero new cache keys.
- [x] Suspense wrapper for useSearchParams (verify-page precedent, build-time trap).
