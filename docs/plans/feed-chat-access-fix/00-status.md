# Feed Visibility & Chat Access Remediation — Cycle Status

**Feature slug:** `feed-chat-access-fix`  
**Started:** 2026-08-09  
**Completed:** 2026-08-09  
**Lead Agent:** deepseek-v4-pro (Hermes)  
**Baseline:** `8acc848` → current

---

## Gate Progress

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ APPROVED | ✅ | [00-retrospective.md](./00-retrospective.md) |
| 1 | Product | ✅ APPROVED | ✅ | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ APPROVED | ✅ | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ APPROVED | ✅ | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ COMPLETE | — | [04-slices.md](./04-slices.md) |

---

## Final Verification

| Check | Result |
|-------|--------|
| `npm run build` (root) | ✅ PASSED — 0 errors |
| `npx vitest run` (player-pwa) | ✅ PASSED — 10 files, 91 tests (85 + 6 new) |
| TypeScript strict | ✅ No errors |
| i18n keys (ar+en) | ✅ 7 new keys, both languages |

---

## Changes Summary

### Root Cause Fixes:

1. **Empty Play Feed** — `EXISTS(subquery)` in `findNearby` SQL replaced with `COALESCE(BOOL_OR(mp.user_id = $1::uuid), FALSE)`. Uses existing `LEFT JOIN match_players mp` — no additional table scan. *(1 line, matches.service.ts)*

2. **Chat Access Blocked (Cold Load)** — `AuthBootstrap` component in root layout populates Zustand from cookie on any page load. Match detail page now reads `match.isJoined`/`match.isUserHost` from `adaptMatchDetail` (which computes them from roster/hostId). *(40 lines, AuthBootstrap.tsx)*

3. **Chat Entry Point** — `ChatSheet` bottom sheet opens when clicking the MessageSquare icon on the match detail page. Messages list shows conditional "Open Chat" / "Join Chat" label. `?chat=open` auto-opens the sheet. *(180 lines, ChatSheet.tsx)*

### Files:
- **3 new files**: AuthBootstrap, ChatSheet, ChatSheet.test.tsx
- **8 edited files**: service (1 line), adapter, hook, layout, 2 pages, 2 i18n files

### Descoped for this cycle:
- WebSocket real-time chat
- Chat message sending UI (endpoint exists, input disabled with "Coming soon" tooltip)
- Drizzle query builder migration (PostGIS still needs raw SQL)
- Sentry/Pino/PostHog instrumentation (Slice 3 pattern)
