# Run #21 — Gate 0 Retrospective (venue-level discovery, P1-28)

**Baseline:** `26a0179` (admin slice 1) — HEAD at run start. Cycle docs: `docs/plans/run21-venue-search/`.

## What landed since run #20 (off-schedule session, 2026-08-31)
- `48170d8` + `ff49a35` — P1-13 cross-day reschedule (API past-slot guard + PWA 7-day picker)
- `ad9e4a3` — P2-36 shared DatePicker strip (30-day window, TODAY dot, aria-current)
- `97735fd` + `26a0179` — admin/partner console UX overhaul gates 0-3 + slice 1 (HQ-only sidebar, RTL shell, Pitches nav)
- Foreign WIP in tree (sibling, NOT staged): admin pitches slice 2 (controller/service/DTO/pages/Drawer/FormField)

## Audit of the area we touch (venues discovery)
**Current state (verified by reading code, not vibes):**
- `GET /venues` (venues.service.ts `findNearby`): already supports `lat/lng/radius_km`, `city` (ILIKE), `is_koralink_partner` — additive AND clauses, `LIMIT 50`, ORDER BY distance/name.
- DTO `GetVenuesDto`: no `search` param. `forbidNonWhitelisted` is NOT set on this controller (matches.controller may differ) — unknown params tolerated, but PWA never sends one.
- PWA clubs page (`(main)/clubs/page.tsx`): has a search input bound to local `searchQuery` state that **client-filters only the fetched ≤50 rows** (lines 38-43). With no device coords the API returns the first 50 approved venues alphabetically → search cannot reach venue #51+. Search is UI-only; the server never sees it.
- i18n: `clubs.searchPlaceholder` exists en/ar; `common.noResults` + `clubs.noClubs` empty-state keys exist.

**Tech debt observed (scope discipline — record, don't fix here):**
- `findNearby` raw SQL `GROUP BY v.id, u.id` — Postgres allows functional dependency, fine.
- No venues jest specs exist at all (module dir has none; `apps/api/test` has none) — we add the first.
- P2-13 pills: "Top Rated" shows all (rating removed), "Indoor" filters amenities — untouched this cycle.

**Fix:feat ratio** since run #19: mostly feat (reschedule, DatePicker, admin shell). Healthy.

## Gate 0 verdict
Proceed to Gates 1-3 (compact). Scope: server-side `?search=` on `GET /venues` + wire the PWA clubs search to the API (debounced). Zero new i18n keys. New jest spec (first venues spec) + new hook vitest.
