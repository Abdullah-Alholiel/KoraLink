# Gate 3 — Program Design (Contract): Match Card Club Identity

The single source of truth for the card header. Frontend-only; no API/type/adapter/i18n contract changes.

## 1. Render contract — MatchCard header

### BEFORE (current)
```tsx
<div className="w-10 h-10 rounded-full bg-gray-200 ...">
  <span className="text-xs font-bold text-gray-500">{match.organizer.name.charAt(0)}</span>
</div>
...
<span className="text-xs text-gray-500">{match.organizer.name}</span>
```
Plus a separate green `Navigation` distance pill in the info row.

### AFTER (target)
```tsx
{/* Header avatar — club icon (decorative; venue name is the accessible label) */}
<div className="w-10 h-10 rounded-full bg-brand-green/10 flex-shrink-0 flex items-center justify-center">
  <Building2 className="w-5 h-5 text-brand-green" strokeWidth={2} aria-hidden />
</div>

{/* Subtitle — club name + distance (distance hidden when unknown) */}
<div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
  <span className="text-xs font-semibold text-brand-black truncate">
    {match.venueName || t('host.unknownVenue')}
  </span>
  {match.distanceM != null && (
    <>
      <span className="text-gray-300" aria-hidden>·</span>
      <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-green">
        <Navigation className="w-3 h-3" strokeWidth={2.5} />
        {formatDistance(match.distanceM, locale === 'ar' ? 'ar' : 'en')}
      </span>
    </>
  )}
  {badge && <span className="ms-1">{badge}</span>}
</div>
```

### Info pills row — remove distance pill
Delete the block that renders `match.distanceM != null` as a `Navigation` pill (it moves to the header). All other pills unchanged.

## 2. Type contract (UNCHANGED)
`Match.venueName: string` · `Match.distanceM?: number | null` · `Match.organizer: OrganizerInfo` all remain. `organizer` stays because `match/[id]/page.tsx` renders the host there.

## 3. Adapter contract (UNCHANGED)
`adaptNearbyMatch` and `adaptMatchDetail` keep mapping `venue_name → venueName`, `distance_m → distanceM`, `host_name → organizer.name`.

## 4. i18n contract (NO NEW KEYS)
Reuses `host.unknownVenue` ("Venue") only as a defensive fallback. Distance is data-formatted by `formatDistance(m, 'ar'|'en')`.

## 5. Import contract
`MatchCard.tsx` gains `Building2` in the existing `lucide-react` import; `Navigation`, `formatDistance`, `useTranslations`, `usePathname` already imported.

## 6. Test contract (`MatchCard.test.tsx`)

| Test | Change |
|------|--------|
| `renders organizer name` ("Khalid FC") | **Replace** → assert `"Green Field Stadium"` (club name) |
| `renders organizer avatar initial` ("K") | **Replace** → assert host initial `"K"` is **absent** and club icon renders |
| *(new)* renders distance when present | `match.distanceM: 3200` → assert `formatDistance(3200, 'ar')` (locale from `/ar/play` mock) |
| *(new)* hides distance when `distanceM` is null/undefined | assert no distance node |

All other tests (title, price `37 SAR`, spots `8/14`, location `Riyadh`, format/surface pills, link `href=/ar/match/match-1`, closing-soon, POTM states) remain **unchanged** and must stay green.

## 7. Contract verification checklist (Gate 3 → Gate 4)

- [x] No mutation endpoint touched — N/A (presentational).
- [x] `Match` type already accepts the exact data (`venueName`, `distanceM`) the SQL produces.
- [x] Adapter already maps both fields — no new adapter.
- [x] No field silently `undefined`: `venueName` has `host.unknownVenue` fallback; `distanceM` is null-guarded (hidden when null).
- [x] No new user-facing strings → no new i18n keys (verified: club/distance are data).
