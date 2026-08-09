# Gate 4 — Vertical Slices: Feed Visibility & Chat Access Remediation

**Feature:** `feed-chat-access-fix`  
**Date:** 2026-08-09  
**Input:** Gate 3 Program Design ([03-program-design.md](./03-program-design.md))

---

## Slice Plan

| Slice | Layer | Files | Hard Gate |
|-------|-------|-------|-----------|
| **1** | Backend SQL | `matches.service.ts` | `npm run build` |
| **2** | Adapter & Hooks | `api-adapter.ts`, `hooks/useMatches.ts` | `npm run build` |
| **3** | Components | `AuthBootstrap.tsx`, `ChatSheet.tsx` | `npm run build` |
| **4** | Integration & i18n | `layout.tsx`, `match/[id]/page.tsx`, `messages/page.tsx`, `en.json`, `ar.json` | `npm run build` |
| **5** | Tests | `test/components/ChatSheet.test.tsx` | `npx vitest run` |

---

## Execution Results

### Slice 1: Backend SQL
- **Change:** 1 line — `EXISTS(subquery)` → `COALESCE(BOOL_OR(mp.user_id = $1::uuid), FALSE)`
- **Verification:** `npm run build` ✅ PASSED (0 errors)

### Slice 2: Adapter & Hooks
- **Changes:** `adaptMatchDetail(detail, currentUserId?)` sets `isJoined`/`isUserHost`; new `useMatchMessages` hook; `useMatch` reads Zustand for `currentUserId`
- **Verification:** `npm run build` ✅ PASSED (0 errors)

### Slice 3: Components
- **New:** `AuthBootstrap` (40 lines, no-UI, populates Zustand from cookie); `ChatSheet` (180 lines, bottom sheet, 4 UX states, disabled send)
- **Verification:** `npm run build` ✅ PASSED (0 errors)

### Slice 4: Integration & i18n
- **Changes:** Layout adds `<AuthBootstrap />`; match detail removes manual `isJoined`/`isUserHost`, opens `ChatSheet`; messages page uses conditional `isJoined ? "Open Chat" : "Join Chat"`; 7 i18n keys added (ar+en)
- **Verification:** `npm run build` ✅ PASSED (0 errors)

### Slice 5: Tests
- **New:** 6 `ChatSheet` tests (loading, empty, populated, hidden, backdrop close, error+retry)
- **Verification:** `npx vitest run` ✅ PASSED — 10 files, 91 tests (85 existing + 6 new)

---

## Final Verification

| Check | Result |
|-------|--------|
| `npm run build` (root) | ✅ PASSED — 2 successful, 0 errors |
| `npx vitest run` (player-pwa) | ✅ PASSED — 10 files, 91 tests |
| TypeScript strict | ✅ No errors |
| i18n keys (ar+en) | ✅ 7 new keys, both languages present |
| Contract checklist | ✅ 23/23 verified |

## Files Changed

| # | File | Type | Lines |
|---|------|------|-------|
| 1 | `apps/api/src/modules/matches/matches.service.ts` | Edit | 1 line |
| 2 | **NEW** `apps/player-pwa/src/components/auth/AuthBootstrap.tsx` | New | 40 lines |
| 3 | **NEW** `apps/player-pwa/src/components/matches/ChatSheet.tsx` | New | 180 lines |
| 4 | `apps/player-pwa/src/app/[locale]/layout.tsx` | Edit | +2 lines |
| 5 | `apps/player-pwa/src/app/[locale]/match/[id]/page.tsx` | Edit | ~30 lines changed |
| 6 | `apps/player-pwa/src/app/[locale]/(main)/messages/page.tsx` | Edit | ~15 lines changed |
| 7 | `apps/player-pwa/src/lib/api-adapter.ts` | Edit | ~10 lines |
| 8 | `apps/player-pwa/src/hooks/useMatches.ts` | Edit | +20 lines |
| 9 | `apps/player-pwa/src/messages/en.json` | Edit | +8 lines |
| 10 | `apps/player-pwa/src/messages/ar.json` | Edit | +8 lines |
| 11 | **NEW** `apps/player-pwa/test/components/ChatSheet.test.tsx` | New | 130 lines |

**Total: 3 new files, 8 edited files. ~444 lines changed.**
