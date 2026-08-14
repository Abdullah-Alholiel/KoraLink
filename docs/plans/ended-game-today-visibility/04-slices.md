# Gate 4: Vertical Slices — Ended Game Today Visibility & POTM Access

> Execution plan divided into 4 self-contained tracer bullets.

---

## Slice Breakdown

### Slice 1: NestJS `findNearby` SQL Query Update (`matches.service.ts`)
- Update `findNearby` SQL `WHERE` clause in `apps/api/src/modules/matches/matches.service.ts` so completed matches scheduled today are returned for participated users (`currentUserId`).

### Slice 2: PWA `MatchCard.tsx` POTM Voting CTA Update
- Update `MatchCard.tsx` to display `🏆 POTM` badge and amber `Vote POTM` action button for completed matches from today where the user is a participant.

### Slice 3: PWA `my-games/page.tsx` Active Filter Update
- Update `my-games/page.tsx` to group matches completed today under active games.

### Slice 4: Full Monorepo Build & Comprehensive Verification
- Run `npx vitest run` (91/91 passing).
- Run `npm run build` (`turbo run build` green).
