# Gate 4 — Vertical Slices: Match State Propagation Fix

**Feature:** `match-state-propagation-fix`  
**Date:** 2026-08-09  
**Input:** Gate 3 Program Design ([03-program-design.md](./03-program-design.md))

---

## Slice Plan

| Slice | Layer | Files | Hard Gate |
|-------|-------|-------|-----------|
| **1** | Backend Data | `matches.service.ts`, `matches.controller.ts` | `npm run build` |
| **2** | Adapter & Types | `types/index.ts`, `api-adapter.ts`, `useMatchActions.ts` | `npm run build` |
| **3** | UI Components | `MatchCard.tsx`, `CancelMatchSheet.tsx`, `LeaveMatchSheet.tsx` | `npm run build` |
| **4** | Integration & i18n | `play/page.tsx`, `my-games/page.tsx`, `messages/page.tsx`, `match/[id]/page.tsx`, `en.json`, `ar.json` | `npm run build` + `npx vitest run` |

---

## Slice 1: Backend Data

### Changes:
1. `matches.service.ts` — `findNearby`: add `currentUserId?` param, add `EXISTS` subquery for `is_joined`
2. `matches.service.ts` — `getMyMatches`: add `TRUE AS is_joined` to SQL
3. `matches.controller.ts` — `findNearby`: add `@CurrentUser()` decorator, pass to service

### Verification:
- `npm run build` must pass
- API stays healthy (`curl /api/v1/health`)

---

## Slice 2: Adapter & Types

### Changes:
1. `types/index.ts` — `Match` + `isJoined?`, `isUserHost?`
2. `api-adapter.ts` — `NearbyMatchApi` + `is_joined: boolean`
3. `api-adapter.ts` — `adaptNearbyMatch` + `currentUserId?` param, maps `isJoined`/`isUserHost`
4. `api-adapter.ts` — `adaptMatchList` + `currentUserId?` param
5. `useMatchActions.ts` — NEW `useCancelMatch` hook

### Verification:
- `npm run build` must pass
- TypeScript compiles with no errors

---

## Slice 3: UI Components

### Changes:
1. `MatchCard.tsx` — + `currentUserId` prop, 4-state button logic
2. `CancelMatchSheet.tsx` — NEW bottom sheet component
3. `LeaveMatchSheet.tsx` — NEW bottom sheet component

### Verification:
- `npm run build` must pass
- Components render correct states per mockup

---

## Slice 4: Integration & i18n

### Changes:
1. `play/page.tsx` — pass `currentUserId` from store to `MatchCard` and `adaptMatchList`
2. `my-games/page.tsx` — pass `currentUserId` from store to `MatchCard` and `adaptMatchList`
3. `messages/page.tsx` — pass `currentUserId` to `adaptMatchList`
4. `match/[id]/page.tsx` — replace `confirm()` with sheet state; wire `useCancelMatch`
5. `en.json` + `ar.json` — 12 new i18n keys

### Verification:
- `npm run build` must pass
- `npx vitest run` — all existing + extended tests pass

---

## Execution Order

```
Slice 1 → build check → Slice 2 → build check → Slice 3 → build check → Slice 4 → build + tests
```

No slice proceeds until the previous hard gate is green.
