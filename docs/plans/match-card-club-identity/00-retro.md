# Gate 0 — Retrospective: Match Card Club Identity

**Feature:** Replace "host" with "club name + distance" on Play screen game cards.
**Baseline:** `2d41528` (last commit), `fix:feat = 1.5:1` over last 30 commits (borderline reactive loop).

## Data-flow audit (DB → API → adapter → component → UI)

Traced the full chain for the card identity fields:

| Layer | Club name | Distance | Host |
|-------|-----------|----------|------|
| DB | `venues.name` ✅ | PostGIS `m.location` ✅ | `users.full_name` ✅ |
| SQL (`findNearby`) | `v.name AS venue_name` ✅ (L198) | `ST_Distance(...) AS distance_m` ✅ (L190) | `u.full_name AS host_name` ✅ (L192) |
| Adapter (`adaptNearbyMatch`) | `venueName: row.venue_name` ✅ (L295) | `distanceM: row.distance_m` ✅ (L312) | `organizer.name: row.host_name` ✅ (L284) |
| Component (`MatchCard`) | ❌ **NEVER RENDERED** | ⚠️ small green pill (L143-148) | ✅ header subtitle (L119) |

## Findings

### IMPORTANT — Club name never surfaced (the actual gap)
`MatchCard` renders `match.organizer.name` (host) as the card's primary identity and the city (`match.location`) in a `MapPin` pill, but **never renders `match.venueName`** (the club). The user's request surfaces a genuine discoverability gap, not just a re-label: the two most decision-relevant facts for choosing a game — *which club* and *how far* — are either hidden or de-prioritized.

### IMPORTANT — Host is redundant on the card
Host is shown in the match detail screen (`match/[id]/page.tsx` uses `organizer`), so repeating it on every card is noise. Rationale (user): "host is known as soon as a user goes in a match."

### No contract break, no tech debt blocking this feature
- `findNearby` is a clean `COALESCE(BOOL_OR(...))` query (no `EXISTS`/bare-row regression).
- No missing Drizzle columns in this path.
- `Match` type already carries `venueName` + `distanceM`; adapter already populates both.

## Decision

Proceed to Gate 1. This is a presentational realignment with **zero backend, type, schema, or i18n-key changes**.
