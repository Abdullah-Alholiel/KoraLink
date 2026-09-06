# E2E Waitlist & Capacity Standardisation — Gate 0 Retro (2026-09-06)

## Trigger (owner)
Abdullah rejected the first E2E pack (commit d8bfc85):
1. **False data** — pack seeded `max_players=12` on a 7v7 pitch (14 capacity). Card read
   12/12 while the lineup rendered 14 slots; "line up is missing two to complete the squad".
2. **Missing CTA** — a fully-taken lineup must offer a Join-Waitlist CTA (board P1-17).
3. **Naming** — `e2e-wl-*` / `E2E Joiner 01` style rejected. Tests must be clean and standard.

## Audit of the touched area
- Capacity is **client-supplied**: `CreateMatchDto.max_players` (2..22), never validated
  against `pitches.size`. Server already ignores client `pitchCostSar` (derives it) —
  precedent for ignoring client capacity.
- **Live violation count (2026-09-06): 6 matches** where `max_players ≠ 2×perSide(pitch.size)`:
  3 from the rejected pack (`e2e-waitlist-match-000X`, 12 on 7v7) + 3 real demo rows
  (16/12/10 on 7v7). The invariance must be enforced, not re-seeded around.
- UI: `TeamLineup.tsx` renders `2×perSide` slots from `pitch.size`; `MatchCard` shows
  `filledSpots/totalSpots` from `max_players` — two sources of truth, no invariant.
- Waitlist: P1-17 confirmed 0-implementation (no table/endpoint/UI).
- Old pack's runner verified real contracts: join POST→201, cancel=POST host-only,
  stale-Full revert works.

## Tech debt found
- No DB-level guard tying `matches.max_players` to `pitches.size` (cross-table CHECK is
  impossible → needs trigger).
- `DELETE /matches/:id/leave` frees spots with no overflow path (the P1-17 churn point).

## Decisions
- **Invariant: `matches.max_players = 2 × per-side(pitch.size)` — ALWAYS** (5v5→10,
  7v7→14, 8v8→16, 11v11→22). Enforced at 3 layers: DB trigger, API derives (client value
  ignored, pitchCostSar precedent), seed self-verifies.
- Old test data files are REPLACED (deleted, not deprecated): `seed.sql` + `run-e2e.sh`
  with `test-*` IDs. DB reset sweeps both old `e2e-%` and new `test-%` rows.
- Waitlist = full P1-17 vertical slice (table → endpoints → auto-promotion → CTA UI).
