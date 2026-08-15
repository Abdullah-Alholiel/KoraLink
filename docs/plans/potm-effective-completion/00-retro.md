# POTM "will be decided" always shown — effective completion time fix

**Cycle:** `potm-effective-completion`
**Date:** 2026-08-15
**Mode:** Autonomous

---

## Gate 0 — Retrospective

**Symptom:** The POTM section on the match detail page always shows "Player of the Match is decided after the match ends", even for matches that have finished.

**Root cause (verified live):** The two-layer match lifecycle is inconsistent around `completed_at`:

- `resolveEffectiveStatus()` (query-time) reports a past-due match as `Completed` **virtually**, based on `scheduled_at + duration_mins`.
- `getPomResult()` and `castVote()` then require the **persisted** `completed_at` column, which is only written by the host's `completeMatch()` or by `autoCompletePastMatches()` — and that auto-complete runs **once at module init**.

So a match that ends *between* restarts keeps `status='Open'` and `completed_at=NULL`, but `resolveEffectiveStatus()` reports `Completed`. `getPomResult()` hits `resolveEffectiveStatus !== 'Completed'` → passes, then hits `!match.completed_at` → returns `{ status: 'not_completed' }` → the UI renders "will be decided".

**Live reproduction (22:09 UTC, 2026-08-15):** match `cf88af2c` ("Indoor 5v5 Tournament") is `status='Open'`, `past_end=true`, `completed_at=NULL`; `GET /matches/cf88af2c/pom-result` returns `{"status":"not_completed"}` even though the match ended at 18:50 UTC.

**Inconsistency inventory:**

| # | Finding | Severity |
|---|---|---|
| 1 | `getPomResult` bails to `not_completed` when `completed_at` is NULL despite effective status `Completed` | CRITICAL (the reported bug) |
| 2 | `castVote` throws "Match completion time not recorded" for the same matches | CRITICAL |
| 3 | `MatchCard` computes `votingOpen` via `isPotmVotingOpen(match.scheduledAt)` with a hardcoded `durationMins=60`, ignoring the match's real duration (adapter already exposes correct `match.votingClosesAt`) | IMPORTANT |
| 4 | `completeMatch` writes `completed_at=now()` (actual) while `autoCompletePastMatches` writes `scheduled_at+duration` (scheduled) — frontend always assumes the latter | MINOR (documented, not fixed this cycle) |

---

## Gate 1 — Product Spec

**User stories:**
- **P0** — As a player viewing a finished match, I see the correct POTM state (voting open / results / no votes) immediately, without waiting for a server restart.
- **P0** — As a player, I can cast a POTM vote for a finished match whose `completed_at` is not yet persisted.
- **P1** — The "Vote POTM" card button honors the match's real duration (not a 60-min default).

**Success criteria:** `pom-result` for `cf88af2c` returns `voting_open` (not `not_completed`) after the fix; a vote can be cast.

---

## Gate 2 — Architecture

Add a single source of truth for "when did this match end":

```
effectiveCompletedAt(match) = match.completed_at ?? (scheduled_at + duration_mins)
```

`getPomResult()` and `castVote()` compute the voting window from `effectiveCompletedAt()` instead of bailing on a NULL `completed_at`. This makes pre-restart (virtual completion) and post-restart (auto-completed) behavior identical.

| Layer | File | Change |
|---|---|---|
| API service | `apps/api/src/modules/matches/matches.service.ts` | add `effectiveCompletedAt()` helper; use it in `getPomResult` + `castVote`; drop the NULL `completed_at` early returns |
| PWA card | `apps/player-pwa/src/components/matches/MatchCard.tsx` | derive `votingOpen` from `match.votingClosesAt` (correct duration) with fallback |

---

## Gate 3 — Contract

`effectiveCompletedAt(match)`:
- `match.completed_at` is `Date | null`, `scheduled_at: Date`, `duration_mins: number` (NOT NULL in schema).
- Returns `match.completed_at` when set, else `new Date(scheduled_at.getTime() + duration_mins * 60_000)`.

Voting window (unchanged length): `closesAt = effectiveCompletedAt(match) + 24h` (`VOTING_WINDOW_HOURS`).

`pom-result` shapes unchanged — `not_completed` is now returned **only** when `resolveEffectiveStatus() !== 'Completed'` (a genuinely unfinished match).

---

## Gate 4 — Slices

1. **Slice 1:** backend `effectiveCompletedAt` + `getPomResult` + `castVote`. Verify `pom-result` for `cf88af2c` returns `voting_open` and a vote succeeds. `turbo run build` green.
2. **Slice 2:** `MatchCard` uses `votingClosesAt`. `turbo run build` + `vitest` green.
