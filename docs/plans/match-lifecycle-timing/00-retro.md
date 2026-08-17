# Match Lifecycle Timing — Host Start/End Windows

## Gate 0 — Retrospective

- Host lifecycle buttons on the match detail page were **ungated by time**: "Start Match" (status `full`) and "End Match" (status `in_progress`) could be pressed at any point.
- Timing math existed only as two ad-hoc inline variables (`isMatchStarted`, `isMatchEnded`) in `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx`.
- Backend `startMatch`/`completeMatch` enforced only host + status — no time window, so a direct API call bypassed any UI gate entirely.

## Decision (Gate 1)

Symmetric 30-minute "early window" before each scheduled boundary:

- **Start**: `now >= scheduledAt − 30 min` — host cannot start the match earlier than 30 min before kick-off.
- **End**: `now >= endsAt − 30 min` — host cannot end the match earlier than 30 min before its scheduled end.
- **No change to existing auto-complete** (still fires at `endsAt`), so the End button is reachable in the window `[endsAt − 30, endsAt]`.

## Contract (Gate 3)

### Constants (mirrored FE/BE — keep in sync)

- `START_EARLY_WINDOW_MINUTES = 30`
- `END_EARLY_WINDOW_MINUTES = 30`

### Backend — `apps/api/src/modules/matches/matches.service.ts`

- `startMatch`: reject with `BadRequestException` when `now < scheduled_at − 30min`.
- `completeMatch`: reject with `BadRequestException` when `now < (scheduled_at + duration_mins) − 30min`.
- Both return `this.findOne(matchId)` (unchanged — already compliant).

### Frontend — `apps/player-pwa/src/lib/match-timing.ts` (new)

- `startEarliestAt(match)`, `endEarliestAt(match)`
- `canStartMatch(match, now?)`, `canEndMatch(match, now?)`
- `matchHasStarted(match, now?)`, `matchHasEnded(match, now?)` (fold in the old inline predicates)

### UI — `page.tsx`

- Start/End buttons `disabled` when outside their window + a localized "available at {time}" hint.

### i18n keys (en + ar)

- `matchDetail.startAvailableAt`
- `matchDetail.endAvailableAt`

## Verification

- `cd apps/api && npx tsc --noEmit`
- `cd apps/player-pwa && npx vitest run`
- `npx turbo run build`
