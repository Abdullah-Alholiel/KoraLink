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
- Slice 4 (tier-C review fixes): forfeit stamp `matches.pitch_forfeited_sar` +
  settlement-revenue counts stamped Cancelled matches (venue actually paid —
  disclosure now true); karma exact-reversal via `match_players.no_show_karma_applied`;
  `isLateHostCancel` covers past-start (dodge closed) with the InProgress exemption
  explicit; migration 0061 (journal + prevId-linked snapshot, tripwires 8/8).
  Terms page paragraph lists extended (closes the follow-up below).

## Verification
- `npx jest src/modules/matches/matches.money-rules-126.spec.ts` → 15/15 green.
- api jest FULL (post-fix) + tsc + turbo 3/3 — re-run by the parent after commit.

## Open follow-ups (documented, non-blocking)
- No-show fee books as MATCH_FEE reference_type — shows in admin GMV as match revenue;
  a dedicated NO_SHOW_FEE type is a deliberate follow-up (enum churn) flagged to counsel.
- The forfeit/settlement semantics for SELF-mode bookings (no pitch debit) don't apply —
  stamp only written on koralink bookings with pitch_cost_sar > 0.
