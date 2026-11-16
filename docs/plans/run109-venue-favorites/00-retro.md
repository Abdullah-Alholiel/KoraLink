# Run #109 — API lane (109%4=1) — P2-161 venue favorites + unblock truth-flag rider

## Gate 0 — Retrospective (2026-10-07)

**Baseline:** run #108 (PRs #90/#91 merged). fix:feat ratio last 15 commits: 4 fix / 5 feat / 6 docs — healthy.

**DECISIONS.md consulted first:** Drawer RIGHT standard untouched (no admin UI this run);
owner-only list (PSP/keys/promote/PDPL/RBAC/credentials) — none touched.

**Premise audits (claims ≠ facts cuts both ways — reviewer claims too):**
1. **P2-163 REFUTED** — "feed error state lacks Retry": community feed
   `(main)/page.tsx:129-143` HAS a Retry button (`onClick={() => refetch()}`, since
   `5f26282` 2026-08-14); play feed `play/page.tsx:242-254` has classify+retry
   (`errorKey(classifyError(error))` + `common.retry`). Reviewer B run-#108 finding was a
   false positive. Board row closed as REFUTED with evidence.
2. **P2-161 CONFIRMED** — grep favorite|bookmark|wishlist → 0 hits in schema + pwa + api.
   Venues controller has only GET suggestions//, GET /, GET /:id. No favorites anywhere.
3. **Reviewer A IMPORTANT (unblock truth-flag)** — real, but the spec
   (`blocks.service.spec.ts:154-161`) pins `{ blocked: false }` as IDEMPOTENT-BY-DESIGN and
   the only consumer (`PlayerProfileSheet.tsx:240-242`) shows the unblock button only when
   status=true, so the "never blocked" case is unreachable through the UI. Downgraded
   IMPORTANT → MINOR rider: add `removed: boolean` to the response (additive, no shape
   break), update spec, widen PWA type.

**Standing bug classes (Reviewer A sweep):** all 9 clean — ::uuid 0, eq-null 0, console 0,
ILIKE unescaped 0 (PR #87 landed complete), WS-auth parity clean (tripwire spec pins
handler set), mutation returns clean, money-sweep writers clean, TOCTOU/FOR UPDATE clean,
tenant scope clean.

**Veto-clock audit (Defaults+48h register):** P1-51/P1-55/P2-51 defaults were NAMED in run
#103's next-run rec but never FORMALLY proposed on their rows (status cells still say
"owner call on shape"). Clocks NOT started. This run formally proposes:
- **P1-51 default:** extend the existing POTM vote (no new per-player rating entity).
- **P1-55 default:** booking-verified stars+text reviews on venues.
- **P2-51 default:** Render deploy-hook runs db:migrate before start.
Clocks start when this run report posts. A later run builds a row only after its 48h elapses
with no veto. NOT built this run (feature-shaped, each needs its own full cycle).

**Admin state check:** N/A — this cycle touches apps/api/src/modules/venues + venues/users
blocks + player-pwa only. Verified clean anyway: `git status --short apps/admin
apps/api/src/modules/partner` → empty; admin service active; no uncommitted owner work.

**Strix:** not due (window Nov 1–3). Security lane: run-1/run-2 findings.json have zero
un-fixed confirmed records → FIX-before-HUNT clean; no HUNT this run (P2-161 buildable
outranks; quota discipline).

## Gates 1-3 (compact)

**Problem:** repeat bookers re-search the same venues every time; no way to save a club.

**User story:** As a player I tap a heart on a club card (clubs list) or hero (club detail)
to save it; a "Favorites" filter pill on the clubs page shows only my saved clubs.

**Scope IN:** venue_favorites table + migration 0046; GET /venues/favorites,
POST+DELETE /venues/:id/favorite; PWA useVenueFavorites hook; clubs-page pill + card heart;
detail-hero heart; optimistic toggle; i18n EN+AR; specs. Blocks rider: `removed` flag.
**Scope OUT:** admin surfacing, per-venue favorite counts (social proof), share, email digests
(Reviewer B P1s — boarded, feature-shaped).

**Gate 3 contracts:**
- `GET /venues/favorites` (declared ABOVE `:id`, auth-walled) → `VenueApi[]` (exact
  findNearby row shape; `distance_m: null`; ORDER BY created_at DESC). BARE array (venues
  GET precedent).
- `POST /venues/:id/favorite` → `{ favorited: true, created: boolean }` (created=true only
  when a row was inserted; idempotent on conflict; 404 unknown venue).
- `DELETE /venues/:id/favorite` → `{ favorited: false, removed: boolean }` (idempotent; no
  404 on missing row — mirrors unblock).
- Rider: `DELETE /users/:id/block` → `{ blocked: false, removed: boolean }` (additive).
- PWA hook: `useVenueFavorites()` → `{ favIds: Set<string>, toggle(venueId), isPending }`
  (React Query `['venues','favorites']`, optimistic patch + rollback, staleTime 5min).
- i18n keys (EN+AR, clubs ns): `favorites` (pill), `favoritesEmptyTitle`,
  `favoritesEmptyDesc`, `favoriteAdd`, `favoriteRemove` (aria-labels). Parity must stay
  leaf-equal.

**Contract checklist:** [x] mutations return explicit flag objects (not bare rows) [x]
frontend types extend existing VenueApi (no new adapter — list shape reused verbatim) [x]
i18n both locales [x] no field silently undefined (distance_m explicitly null) [x] route
ordering safe (favorites before :id, comment mirrors suggestions comment).

## Gate 4 slices
1. Schema + 0046 migration (journal-appended, no snapshot per VPS convention) — never
   db:migrate before its code exists in the same run (no-half-slices rule).
2. API: service methods + controller routes + DTO-less (no body) + jest specs → gates.
3. PWA: hook + clubs pill/card heart + detail hero heart + i18n + component test → gates.
4. Blocks rider + spec.
