# Gate 1 — Product Spec: Match Card Club Identity

## Problem Statement
On the Play feed, a game card's primary identity is the **host's name**, but the host is only relevant *after* entering a match. The two facts a player actually needs to choose a game — **which club** it's at and **how far** it is — are either missing (club name is never shown) or visually de-prioritized (distance is a tiny pill). This wastes scan time and hides the strongest sorting signals.

## User Stories (priorities)

- **P0** — As a player browsing the Play feed, I want each card to show the **club name** and **distance**, so I can instantly judge where a game is and how close it is without opening it.
- **P0** — As a player, I no longer need to see the host's name on the card, because the host is visible once I enter the match.
- **P1** — Distance should remain visible when present and disappear cleanly when location is unknown (no empty badge).

## Scope

### IN SCOPE
- `MatchCard` header: swap host identity → **club name + distance**.
- Remove the now-duplicate distance pill from the info row.
- Club icon (branded, circular) replaces the host-initial avatar in the header.
- Update `MatchCard` tests to assert the new identity.
- Applies to all three card consumers (Play feed, My Games, Club detail) for a **single consistent card** — the host-redundancy rationale is universal.

### OUT OF SCOPE
- Backend/SQL/type/schema changes (data already flows).
- Removing `organizer` from the `Match` type or adapter (match detail still uses it).
- Adding a venue logo field (no logo exists in `venues`; icon is a placeholder that can be swapped for an image later).
- Pitch name (`venueDetails`) on the card.

## Success Criteria
1. Play card header renders **club name + distance**; host name is absent.
2. Distance pill no longer duplicated in the info row.
3. `npx vitest run` green; `npm run build` green (zero errors).
4. Card renders correctly in both `en` and `ar` (RTL + Arabic distance numerals via `formatDistance`).

## Risks
- **Club-name redundancy on Club detail** — every card on a club page repeats the same club name. Accepted: consistency across a single shared card outweighs the minor repetition (Airbnb-style "location everywhere" convention).
- **Venue name missing** — `venues.name` is `NOT NULL` and every match has pitch→venue, so it is always present; a light `host.unknownVenue` fallback is added defensively.

## Open Questions
- None blocking. (Optional: also surface pitch name `venueDetails` as a pill — deferred unless requested.)
