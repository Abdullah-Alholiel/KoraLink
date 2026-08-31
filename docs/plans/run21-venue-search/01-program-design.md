# Run #21 — Program Design (compact Gates 1-3): P1-28 venue-level search

## Gate 1 — Product
- **Problem (user POV):** "Search clubs" only filters the first 50 fetched venues (client-side); beyond that the search silently misses results, and the API has no name search. Users can't reliably find "a pitch near me named X".
- **User story:** As a player I type a club/venue name (or city) in the Clubs search and get matching venues from the WHOLE table, not just the first page.
- **Scope IN:** `GET /venues?search=` (additive AND, name OR city ILIKE, server-side); PWA clubs search debounced → API; hook sends `search`; empty state already covered by existing keys.
- **Scope OUT:** pitch-availability query at venue level, geo-ranked search, city dropdown UI, pagination of venues (LIMIT 50 stays), pg_trgm fuzzy ranking (noted; ILIKE sufficient for exact-substring search — pg_trgm is a later perf/ranking option).
- **Success criteria:** `?search=kings` returns only KSU; `?search=` returns all (no-op); PWA typing filters server-side (queryKey change → refetch); gates green; live probe on restarted API.

## Gate 2 — Architecture
- **API:** `GetVenuesDto` += `search?: string` (`@IsOptional @IsString @MaxLength(80)`); `findNearby` builds `searchClause = search.trim() ? AND (v.name ILIKE %s% OR v.city ILIKE %s%) : sql\`\`` — **additive AND** (venue-feed rule: never short-circuits geo/city/partner/approved predicates). Trim + length guard server-side.
- **PWA:** `useVenues` params += `search?: string` (queryFn appends `search`, queryKey `['venues', params]` already varies → refetch on change). clubs page: local `searchQuery` state → 300ms debounce → `useVenues({ lat/lng?, search })`; pills still filter the fetched set client-side (unchanged semantics).
- **Files changed:** `apps/api/src/modules/venues/dto/get-venues.dto.ts`, `venues.service.ts`, NEW `venues.search.spec.ts`; `apps/player-pwa/src/hooks/useVenues.ts`, `(main)/clubs/page.tsx`, NEW `test/hooks/useVenues.test.tsx`; docs.

## Gate 3 — Contract (verified before Gate 4)
**Endpoint shape (unchanged envelope — additive param):**
```
GET /api/v1/venues?search=kings&lat=24.7&lng=46.7
→ 200 [ { id, name, city, address, amenities, is_approved, is_koralink_partner,
          distance_m, owner_id, owner_name, pitch_count, open_hour, close_hour,
          closed_day_0..6 } ]   // same NearbyVenueRow as today
GET /venues?search=<81 chars> → 400 (MaxLength 80)
```
**TS signatures:**
```ts
// GetVenuesDto
@IsOptional() @IsString() @MaxLength(80) search?: string;

// VenuesService.findNearby — unchanged signature, new clause:
async findNearby(dto: GetVenuesDto): Promise<NearbyVenueRow[]>

// useVenues — params type gains search:
useVenues(params?: { lat?; lng?; city?; search?; is_koralink_partner? }): UseQueryResult<VenueApi[]>
```
**Adapter:** none (raw API shape consumed directly, as today).
**i18n:** ZERO new keys — `clubs.searchPlaceholder`, `common.noResults`, `clubs.noClubs` already exist in both locales (684/684 parity preserved).

### Contract verification checklist
- [x] Mutation endpoints untouched — no mutation in this slice (GET-only).
- [x] `NearbyVenueRow` type unchanged — frontend `VenueApi` accepts the exact JSON.
- [x] No silently-undefined fields introduced — additive param only.
- [x] i18n keys: 0 new, parity 684/684 maintained.
- [x] Additive AND discipline: searchClause appends, never replaces geo/city/partner clauses.

### Rider items (bundled, same commit family)
- **P2-37:** `rescheduleMatch` guard `newMax < 2 → BadRequest` before `round2(newCost / (newMax - 1) + ...)` (matches.service.ts:1920) + one spec (defense-in-depth; DTO floors at 2).
- **P2-35:** `clubs/[id]` `formatDateLabel` locale-switch (`ar-SA`/`en-US` like siblings) + `venue-hours.ts` `riyadhHour` pins `hourCycle: 'h23'`.
