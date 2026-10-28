# P2-269 — Venue photos on the player PWA — Gates 1-3 compact

Run #171 (2026-10-28). Single compact doc (autonomous mode, koralink-software-factory §Autonomous).

## Gate 1 — Product spec

**Problem:** venues have photos (admin uploads them since run #170, stored in SeaweedFS, served
publicly by the API) but players never see them: the clubs list shows letter avatars, the venue
detail hero shows the same stock stadium image for every venue.

**User stories:**
- P0 — As a player browsing clubs, I see each venue's real photo on its card (first image), with
  the letter avatar as fallback when a venue has none.
- P0 — As a player opening a venue, the hero shows the venue's first photo (stadium art stays as
  fallback), with the existing gradient overlay unchanged.
- P1 — As a player with saved favorites, favorite cards show the same photo treatment (same
  component path — favorites render via the same card).

**Scope:** IN — API public reads return `images`; VenueApi/VenueDetailApi type; clubs card +
detail hero render; CSP `img-src` += API origin; letter-avatar/stadium fallbacks; lazy loading;
alt = venue name. OUT — gallery/lightbox (P2 follow-up noted on the board row), avatar photos
(P2-50 anchor), moderation (P2-268), admin surfaces (done run #170).

**Success criteria:** live clubs page cards show uploaded venue photos; venue detail hero shows
the venue photo; venues without photos fall back (letter avatar / stadium); CSP allows the media
origin; build + vitest + tsc green; live E2E probes green.

## Gate 2 — Architecture

Data flow: `venues.images jsonb` → `GET /venues` / `GET /venues/favorites` SQL adds `v.images` →
PWA `VenueApi.images?: string[]` → `mediaUrl(path)` helper joins API origin → card `<img>` with
fallback; detail hero swaps `src` between photo and `/images/stadium-bg.png`.

Files changed:
| File | Change |
|---|---|
| apps/api/src/modules/venues/venues.service.ts | +`v.images` in findNearby + listFavoriteVenues SELECTs; `images: unknown` typed on NearbyVenueRow |
| apps/player-pwa/src/hooks/useVenues.ts | `images?: string[]` on VenueApi |
| apps/player-pwa/src/lib/media-url.ts (NEW) | `mediaUrl(path): string` — API-origin join + managed-path guard |
| apps/player-pwa/src/app/[locale]/(main)/clubs/page.tsx | card photo w/ letter-avatar fallback (one block, covers all tabs incl. favorites) |
| apps/player-pwa/src/app/[locale]/clubs/[id]/page.tsx | hero src = first image or stadium fallback |
| apps/player-pwa/next.config.mjs | img-src += apiOrigin (same derivation connect-src already uses) |
| apps/player-pwa/test/app/clubs-venue-photos.test.tsx (NEW) | photo render + fallback specs |

i18n: none needed (alt = venue name; fallbacks are visual, not textual) — no EN/AR key churn.

Risks: CSP miss (covered: derive from the same `apiOrigin` connect-src already computes); huge
images on list (mitigated: loading=lazy + object-cover fixed-height); PWA offline SW cache of
cross-origin images (default SW runtime cache ignores opaque cross-origin GETs — photos
degrade to fallback offline, acceptable and matches the 5-UX-state standard).

## Gate 3 — Program design (contracts)

**API JSON — `GET /venues` row (delta only):**
```json
{ "id": "uuid", "name": "...", "images": ["/media/venues/<venueId>/<sha>.jpg"], ... }
```
`images` is `string[]` (jsonb → driver parses to JS array; NOT NULL DEFAULT '[]' guarantees
presence on every row). `GET /venues/favorites` rows gain the identical key. `GET /venues/:id`
already returns it (un-narrowed findFirst) — zero API change there.

**TS signatures:**
- `NearbyVenueRow.images: unknown` (raw SQL passthrough; typed through the adapter contract below)
- `VenueApi.images?: string[]` (optional: keeps stub VenueApi objects type-valid)
- `VenueDetailApi extends VenueApi` — inherits `images`
- `mediaUrl(path: string | undefined | null): string | null` — null when path is not a managed
  `/media/venues/` path (defense: jsonb is user-writable by admins/partners; the UI must never
  `src=` an arbitrary stored string — XSS-safe by construction since we only accept the managed
  prefix and render via React attribute binding).

**Hook contracts:** `useVenues` / `useVenueFavorites` return types widen only (additive key) —
existing consumers unaffected (verified: zero `images` reads in PWA today).

**Adapter contract:** no new adapter — raw `images` array consumed directly by the two render
sites via `mediaUrl(images?.[0])`.

### Contract verification checklist (shown explicitly)
- [✓] `GET /venues` rows will carry `images: string[]` (SELECT adds `v.images`; jsonb NOT NULL DEFAULT '[]')
- [✓] `GET /venues/favorites` rows identical shape (same SELECT column, adapt-by-extending rule)
- [✓] `GET /venues/:id` already carries `images` (Reviewer B run #171 live-verified 4/4 rows non-null)
- [✓] `VenueApi.images?: string[]` accepts the exact JSON (string[] superset of unknown passthrough)
- [✓] No field silently undefined that the UI assumes: UI reads `venue.images?.[0]` (optional chain at every site)
- [✓] mediaUrl() null-guards non-managed paths → fallback renders, never a broken `<img>`
- [✓] CSP: img-src gains the API origin derived from the SAME env var connect-src uses — single source
- [✓] i18n: zero new user-facing strings (alt = venue.name) → no parity churn
- [✓] Mutation rule N/A (read-only cycle); spots-count rule N/A (no match SQL touched)
- [✓] 5 UX states: loading (skeleton card unchanged), error (existing error state unchanged),
      empty (letter avatar), offline (fallback via SW semantics), success (photo) — all preserved
