# Gate 4: Vertical Slices — POTM Card Button Redesign & Voted State

> Execution plan divided into 4 self-contained tracer bullets.

---

## Slice Breakdown

### Slice 1: NestJS `findNearby` SQL Query & DTO (`matches.service.ts`)
- Add `has_voted` column to `findNearby` query in `apps/api/src/modules/matches/matches.service.ts`.

### Slice 2: PWA Domain Types & API Adapter (`types/index.ts` & `api-adapter.ts`)
- Add `hasVoted?: boolean` to domain types and adapt in `adaptNearbyMatch`.

### Slice 3: i18n & `MatchCard.tsx` Button Redesign
- Add `votedShort` i18n keys to `en.json` & `ar.json`.
- Redesign `MatchCard.tsx` button and badge for `hasVoted` state with Apple HIG compact pill dimensions.

### Slice 4: Full Monorepo Build & Comprehensive Verification
- Run `npx vitest run` (91/91 passing).
- Run `npm run build` (`turbo run build` green).
