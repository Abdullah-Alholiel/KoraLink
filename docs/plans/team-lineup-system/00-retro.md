# Cycle: Team Lineup System — Two-Team Auto-Assignment + Clickable Profiles

## Root Causes Identified

### Bug 1: Count discrepancy (card shows 0/14, detail shows 2/14)
- `adaptMatchDetail` line 297: `filledSpots: players.length` — counts ALL players including host
- Feed card: `spots_filled` uses `COUNT FILTER (WHERE is_host = false)` — excludes host
- Fix: `adaptMatchDetail` should also exclude host from filledSpots

### Bug 2: No team assignment on join
- `joinMatch` line 258-265: inserts with no `team` value (null)
- Schema has `teamEnum('Home', 'Away')` but join never assigns
- Fix: auto-assign alternating teams (joiner goes to team with fewer players)

### Bug 3: TeamLineup shows single team, not two
- Currently a unified card showing all players
- User wants two teams (White/Dark) with alternating auto-assignment

### Missing: Clickable user profiles
- No way to click a player and see their profile
- Need a profile sheet component

## Implementation Plan (4 slices)

### Slice 1: API — auto team assignment + fix counts
- `joinMatch`: assign team by alternating (team with fewer non-host players)
- `adaptMatchDetail`: exclude host from filledSpots

### Slice 2: Frontend types + adapter
- `RosterPlayer` type: add `team` and `isHost`
- `buildRoster`: pass through `team` and `isHost`
- `MatchPlayerApi`: already has `team` field

### Slice 3: TeamLineup redesign — two teams
- Split into Home (White) and Away (Dark) team cards
- Each team shows players on that team + open slots
- Host always on Home team with crown badge

### Slice 4: Player profile sheet
- Clickable player rows → bottom sheet with avatar, name, stats
- Uses existing `/users/:id` or shows data from roster + lightweight API
