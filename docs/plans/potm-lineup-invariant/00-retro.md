# POTM Lineup Invariant — Gate 0 Retrospective + Fix Plan

**Date:** 2026-08-14
**Trigger:** "Some games have POTM set to a player name which does not exist in
the team lineup. This should never happen — either no one has votes, or the
votes of the players for each other so a player of the team lineup has to be
POTM. Standardise implementation."

## Root Cause (confirmed against live DB)

POTM winner is derived from raw `match_votes` in **three** independent places,
and **none** verify the candidate is a member of the match's `match_players`
lineup:

| # | Location | Defect |
|---|----------|--------|
| 1 | `matches.service.ts` → `getPomResult` (winner query, closed branch) | `match_votes ⋈ users`, **no `match_players` join** → counts votes for anyone |
| 2 | `users.service.ts` → `getPomCount` (profile "POTM wins" stat) | `match_votes ⋈ closed_matches`, **no `match_players` join** → inflates `pom_count` |
| 3 | `drizzle/seed.ts` → POM vote section | **Hardcodes** `candidate_id = yousef_q` / `sultan_d` without checking they are in that match's roster |

Only `castVote` (vote-time) validates lineup membership — which is why votes
cast through the API are fine, but the seed and any vote cast before a player
leaves (or is marked no-show) produce an invalid POTM winner.

### Live-data evidence

```
== pom_winner NOT in lineup ==
"Last Week 11v11 Classic"  winner = Yousef Al-Qahtani (NOT in roster)
"Last Week Indoor 5v5"     winner = Sultan Al-Dossari (NOT in roster)

== votes with candidate NOT in lineup ==
match 06e9a824 (Indoor 5v5)   candidate Sultan  → 3 votes (all invalid)
match 665036bb (11v11 Classic) candidate Yousef  → 3 votes (all invalid)
```

After filtering votes to lineup members, **both completed matches have zero
valid votes** → the correct result is `no_votes` (not a phantom winner).

## The Invariant (single source of truth)

> **A POTM winner MUST be a player in the match's `match_players` roster and
> must not be a no-show.**

This invariant is enforced at **every** winner-derivation path, not just at
vote time:

```sql
INNER JOIN match_players mp
  ON mp.match_id = mv.match_id
 AND mp.user_id = mv.candidate_id
 AND mp.no_show = false
```

## Fix Plan

1. **`getPomResult`** — add the `match_players` lineup join to the winner query.
2. **`getPomCount`** — add the same join inside the `vote_winners` CTE.
3. **`seed.ts`** — derive POTM candidates from each match's actual roster
   (`mNPlayers`), never hardcode user IDs.
4. **Data cleanup** — re-seed the dev DB (`npm run db:seed`) so the completed
   matches carry valid votes; verify via DB query + `/pom-result` endpoint that
   any winner is a lineup member.

## Out of scope (observed, not part of this fix)

- `seed.ts` assigns the lineup host by array index (`allHandles[i % 8]`) instead
  of the match's real `host_id`, so a completed match's lineup host can differ
  from its actual host. Separate lineup-integrity bug — flagged, will fix in a
  follow-up if desired.

## Verification (non-negotiable)

- `cd apps/api && npx tsc --noEmit` — pass
- `cd apps/player-pwa && npx vitest run` — 91 pass / 0 fail
- `npm run build` (turbo) — zero errors
- Re-seed + SQL query proves `pom_winner_id` ∈ lineup (or NULL / no_votes)
