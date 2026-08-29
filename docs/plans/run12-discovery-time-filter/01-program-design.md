# Run #12 — Discovery time-of-day filter (P1-2 slice)

## Gate 0 — Retro (area: discovery / GetMatchesDto / FilterBar)

- Baseline: 8eb8774 (run #11 graphify). Recent cycle pattern: fix-heavy but each fix added
  regression specs (fix:feat ≈ 1:1 over runs #9–#11 — healthy).
- Prior art in the exact touch area: run #9 gender-filter fix (306c74c) established the
  additive-clause pattern + `matches.discovery-filters.spec.ts` harness (SQL param capture).
- Reviewer A confirmed standing bug classes clean; mutation contract on matches.service fixed.
- P1-2 remaining was `skill_level` (needs Abdullah semantics decision — stays blocked) and the
  implicit "no time-of-day filter" gap (Reviewer B run #11 P1, re-confirmed by code read:
  GetMatchesDto has date but no time param; FilterBar has no time control).
- Decision: build the time-of-day window as the next P1-2 slice — pure query+UI, additive AND
  clause (venue-lesson: never short-circuit the status/time predicate), no migration.

## Gates 1–3 — Program design (compact)

User story: "As a player I want to find games tomorrow *evening* (or morning/afternoon/late
night) without scrolling through all-day listings." (Reviewer B run #11 P1 #2.)

Scope IN: `time` preset param (morning|afternoon|evening|night), Riyadh-local wall-clock
window, FilterBar quick chips + i18n (en/ar), specs. Scope OUT: arbitrary from/to times
(future), skill_level (blocked on product semantics), server-side text search.

### Exact contracts

API query contract (GET /matches):
- `time=morning|afternoon|evening|night` (optional, `@IsIn(TIME_WINDOW_KEYS)`, forbidNonWhitelisted-safe).
- Windows (Riyadh local hour, scheduled_at): morning [4,12) · afternoon [12,17) ·
  evening [17,23) · night wraps [23,04) (`h>=23 OR h<4`).
- Response shape UNCHANGED (NearbyMatchApi[] — additive WHERE only).

SQL (additive AND, mirrors dateClause):
`AND EXTRACT(HOUR FROM (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')) >= <start>`
`... < <end>` (OR-form when wrapping). New clause interpolated after `${dateClause}`.

TS signatures:
- dto: `time?: TimeWindowKey` + `TIME_WINDOWS: Record<TimeWindowKey, {startHour, endHour}>`
  exported from get-matches.dto.ts (single source of truth).
- service: `findNearby` destructures `time`; builds `timeClause`.
- hook: `useMatches` filters gain `time?: string | null` → `params.time`.
- FilterBar: `PlayFilters` gains `time: string | null`; TIME chips single-select toggle;
  activeCount + reset include time.

i18n keys (en / ar):
- play.filters.time: "Time of day" / "وقت اليوم"
- play.filters.time.morning: "Morning" / "صباحاً"
- play.filters.time.afternoon: "Afternoon" / "عصراً"
- play.filters.time.evening: "Evening" / "مساءً"
- play.filters.time.night: "Night" / "ليلاً"

### Gate 3 contract verification checklist

- [✓] Response shape unchanged — additive WHERE clause only; NearbyMatchApi[] untouched.
- [✓] DTO accepts exactly the 4 PWA tokens (IsIn) — invalid tokens 400 (strict, mirrors gender).
- [✓] Query-string typing: `time` is @IsString, no @Type needed (not numeric).
- [✓] Hook passes `time` only when set; queryKey already includes whole `filters` object →
      cache invalidation automatic.
- [✓] FilterBar PlayFilters is consumed only by play/page.tsx (grep) — new required field
      breaks nothing else; FilterBar reset literal updated in same commit.
- [✓] i18n keys added to BOTH en.json and ar.json (parity assertion i18n.test.ts covers drift).
- [✓] No schema/migration changes (Phase 4.5: nothing to pair).
- [✓] Midnight wrap handled explicitly (`night` uses OR-form) — jest pins bound params 23/4.
