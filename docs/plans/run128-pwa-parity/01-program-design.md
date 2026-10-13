# Run #128 — Program Design (Gates 1–3 compact)

## Items
1. **P2-187** — Amenity codes render localized EN+AR on club surfaces.
2. **P2-188** — DM conversation error state gets a Retry CTA.

## P2-187 design
- i18n keys `clubs.amenity.<code>` for the 7 live-DB codes (changing_rooms, parking,
  water_cooler, gym, prayer_room, cafe, floodlights) + `clubs.amenity.unknown` fallback,
  both en.json + ar.json (parity count +15 leaves).
- Unknown-code fallback chain: `t(known key)` → `code.replace(/_/g,' ')` with EN text —
  future amenities degrade to today's behavior, never blank.
- Icons: add `prayer_room: '🕌'` to AMENITY_ICONS (club detail page).
- Both sites: `clubs/[id]/page.tsx` (full labels) + `(main)/clubs/page.tsx` (label in chips).
- API/DB unchanged (codes are stable enum-ish strings).

## P2-188 design
- `messages/[id]/page.tsx` error block mirrors Play page: Retry button
  `onClick={() => refetch()}` + `t('common.retry')` (key exists EN+AR).
- Verify the hook exposes `refetch` (react-query useQuery — verify in build gate).

## Contracts (Gate 3 checklist)
- [x] No API change → no response-shape risk.
- [x] i18n keys added in BOTH locales before component uses them (next-intl throws on
      missing key → build/runtime guard is the vitest sweep).
- [x] No field silently undefined: fallback covers unknown codes.
- [x] RTL: labels flow with dir; no layout change (chips wrap).

## Slices
- S1: i18n keys (en+ar) → vitest i18n parity test green → commit.
- S2: component wiring (label fn + icon) both pages → build+tests → commit.
- S3: DM retry CTA → build+tests → commit.
