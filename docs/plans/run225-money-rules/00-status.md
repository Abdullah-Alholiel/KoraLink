# Run #225 — Cycle Status (money rules, launch condition 6)

Mode: autonomous — all gates self-approved by the factory lane.

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE | autonomous | [00-retro.md](./00-retro.md) |
| 1 | Product Spec | ✅ DONE (owner decisions D-20261115-04, D-20261113-10) | autonomous | kanban/DECISIONS.md |
| 2 | Architecture | ✅ DONE (in place, existing caller txs) | autonomous | [00-retro.md](./00-retro.md) |
| 3 | Program Design | ✅ DONE (keys `refund-<matchId>`, `noshow-fee-<mpId>`, `noshow-fee-reversal-<mpId>`) | autonomous | [00-retro.md](./00-retro.md) |
| 4 | Vertical Slices | ✅ DONE | gates green | uncommitted working tree (the parent session commits) |

## Slice log
- Slice 1: Rule A in `cancelMatch` + `isLateHostCancel` + `pitch_forfeit` push key.
- Slice 2: Rule B in `markNoShow` (fee, reversal, karma) + `noshow_fee` log line.
- Slice 3: spec `matches.money-rules-126.spec.ts`; terms keys EN+AR; lawyer brief §4.1.

## Verification
- `npx jest src/modules/matches/matches.money-rules-126.spec.ts` → 11/11 green.
- `npx jest src/modules/matches src/modules/notifications` → 44 suites / 359 tests green.
- `npx tsc --noEmit -p apps/api/tsconfig.json` → 0 errors.
- PWA vitest (legal-sections, legal-truth-pins, i18n parity) → green.

## Open follow-up
- Wire `termsRefundBody5` / `termsConductBody5` into `apps/player-pwa/src/app/[locale]/terms/page.tsx`.
