# Gate 2 — Architecture: Match Card Club Identity

## Overview
A presentational realignment of the shared `MatchCard`. The data flow is **already complete** end-to-end; only the render layer changes. No new adapter, no new hook, no new endpoint.

```
DB (venues.name, geography) ──► SQL (venue_name, distance_m)
        ──► adaptNearbyMatch (venueName, distanceM)
        ──► MatchCard header (club icon + venueName + distance)   ← CHANGED
```

## Component Changes

### `components/matches/MatchCard.tsx` (ONLY file changed in src)
**Header (lines 106-135):**
- Avatar: host-initial circle → circular **club icon** (`Building2`, `bg-brand-green/10 text-brand-green`), `aria-hidden` (decorative; the venue name is the accessible label).
- Subtitle: `match.organizer.name` → `match.venueName` (fallback `t('host.unknownVenue')`) + inline **distance** (`Navigation` icon + `formatDistance(match.distanceM, locale)`), hidden when `distanceM == null`.

**Info pills row (lines 137-174):**
- Remove the green `Navigation` distance pill (lines 143-148) — distance now lives in the header.

Everything else (title, time, closing-soon, badges, price, spots, roster avatars, POTM states, gender/format/surface/intensity pills, private lock) is **unchanged**.

## Files Changed

| File | Change |
|------|--------|
| `apps/player-pwa/src/components/matches/MatchCard.tsx` | Header identity swap + remove distance pill |
| `apps/player-pwa/test/components/MatchCard.test.tsx` | Assert club name + distance; drop host-initial assertion |

**Not changed:** backend (`matches.service.ts` already returns `venue_name` + `distance_m`), `types/index.ts` (has `venueName` + `distanceM`), `api-adapter.ts` (already maps both), i18n JSON (no new keys), schema.

## i18n
- **No new keys.** Club name and distance are data. `formatDistance` already emits `m`/`km` and Arabic numerals (`٣٫٢ كم`).
- Reuse existing `host.unknownVenue` ("Venue") as a defensive fallback only.

## RTL / A11y
- Logical properties already used (`ms-*`, `text-end`). Icon is decorative (`aria-hidden`). Distance uses `dir`-safe formatting.

## Risks & Mitigations
- **Club-detail redundancy** → accepted (consistency > local optimization). See Gate 1.
- **Missing venue name** → `host.unknownVenue` fallback.

## Descoped
- Pitch name on card, venue logos, host context badge.
