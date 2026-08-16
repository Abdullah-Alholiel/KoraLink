# Club Matches First-Look — Cycle Status

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | — | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE | — | [01-product.md](./01-product.md) |
| 2 | Architecture | ✅ DONE | — | [02-architecture.md](./02-architecture.md) |
| 3 | Program Design | ✅ DONE | ✅ (2026-08-16) | [03-program-design.md](./03-program-design.md) |
| 4 | Vertical Slices | ✅ DONE | — | S1 backend+page, S2 i18n+test |

## Gate 4 verification (real output)
- `npm run build` → **2/2 tasks successful** (api + player-pwa), `clubs/[id]` route compiled.
- `npx vitest run` → **15 files, 126 tests passed** (incl. 4 new `MatchDateSections` tests).
- Live API: `GET /api/v1/matches?venue_id=…` (no date) returns only `Open`/`Full` upcoming
  matches; a `Completed` match within the 24h POTM window appears **only for a participant**
  (u1) and is excluded for a non-participant (u5) — same semantics as the Play feed.

## Changes
- `apps/api/.../matches.service.ts` — removed `venue_id ? TRUE` bypass (F4).
- `apps/player-pwa/.../clubs/[id]/page.tsx` — all-games default + `MatchDateSections` +
  `currentUserId` + `dateInRiyadh` (F1/F2/F3).
- `apps/player-pwa/src/messages/{en,ar}.json` — `allMatches`, `showAll`, `noMatchesAll`;
  removed `backToToday`.
- `apps/player-pwa/test/components/MatchDateSections.test.tsx` — NEW.
