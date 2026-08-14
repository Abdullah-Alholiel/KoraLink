# Gate 4: Vertical Slices — Ongoing Game Join & Status Handling

> Execution plan divided into 4 self-contained tracer bullets.

---

## Slice Breakdown

### Slice 1: NestJS Backend Status Validation (`matches.service.ts`)
- Update `joinMatch` in `apps/api/src/modules/matches/matches.service.ts` to accept `InProgress` matches with available spots.

### Slice 2: i18n Keys & `OngoingGameJoinSheet.tsx` Component
- Add i18n keys for ongoing match join notice to `en.json` & `ar.json`.
- Create `apps/player-pwa/src/components/matches/OngoingGameJoinSheet.tsx`.

### Slice 3: PWA `match/[id]/page.tsx` Ongoing Game Join Integration
- Update `showJoin` logic in `match/[id]/page.tsx` to include `in_progress` matches.
- Integrate `OngoingGameJoinSheet.tsx` in `handleJoinClick`.

### Slice 4: Full Monorepo Build & Comprehensive Verification
- Run `npx vitest run` (91/91 passing).
- Run `npm run build` (`turbo run build` green).
