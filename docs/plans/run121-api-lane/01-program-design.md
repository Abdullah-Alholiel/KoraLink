# Run #121 — Program Design (Gates 1-3 compact)

## Item 1 — P2-174 cross-pitch guard (single-path createMatch)

**Problem.** The koralink single-slot path locks the slot `FOR UPDATE` but never verifies
`slot.pitch_id === dto.pitch_id`. A crafted payload pairing pitch B's slot id with pitch A's
`pitch_id` books A's inventory at B's derived hourly rate (price derives from `dto.pitch_id`)
and stamps a corrupt cross-pitch `booking_slot_id`. Reviewer A: CRITICAL, pre-existing
(P2-174, PR-Agent run #120 r1 found the same hole in the recurring path).

**User story.** As the platform, I refuse any booking where the locked slot does not belong
to the pitch being priced — before any insert, slot mark, or wallet debit.

**Contract.**
- Guard placement: immediately after slot existence (404), BEFORE `is_booked` (409) —
  a mismatched pairing is a bad request (client bug), not a contention state.
- Exact behavior: `BadRequestException('Slot does not belong to this pitch.')` — byte-identical
  wording to `createRecurringMatches` (:2340) and `rescheduleMatch` (:3298).
- Locked SELECT widened: `SELECT id, is_booked, slot_date, start_time, pitch_id FROM pitch_slots … FOR UPDATE`
  (varchar(36) ids; `::text` cast form unchanged).

**Files.** `apps/api/src/modules/matches/matches.service.ts` (guard + widened SELECT);
`matches.default-booking-mode.spec.ts` (mock widened + 2 tripwires: reject-before-any-side-effect,
accept-legit-flow); `matches.koralink-wallet.spec.ts` (mock +pitch_id).

**Gate 3 checklist.**
- [x] No mutation-contract change (response shape unchanged; findOne outside tx untouched)
- [x] No new i18n surface (API-side guard, existing wording reused)
- [x] Tests: matches jest 32 suites / 240 tests green (was 238)
- [x] No schema/migration change

## Item 2 — P1-65 partner revenue view (zeroshot lane `01a1289c`)

**Problem.** `GET /partner/earnings` returns only a flat settlement list + pending/paid totals.
Multi-venue partners price blind: no per-venue revenue, no multi-week trend, no utilization.
(The partner DASHBOARD already has a 7-day `weeklyTrend` — P2-109 — so the convention exists.)

**Contract (additive; existing fields byte-compatible).** `getEarnings` keeps
`{ settlements, totalPending, totalPaid }` and adds:
```jsonc
{
  "perVenue": [ { "venueId": "…", "venueName": "…", "bookedCount": 3, "revenue": "1050.00" } ], // SQL GROUP BY venue, revenue DESC, 4-week Riyadh window
  "fourWeekTrend": [ { "weekStart": "2026-09-14", "revenue": "700.00", "bookedCount": 2 } ],    // 4 zero-filled weekly buckets, no holes
  "utilizationPct": 37.5  // booked/total pitch_slots in window ×100, 1 decimal; 0 when no slots
}
```
Empty branch returns `perVenue: []`, `fourWeekTrend: [4 zeroed weeks]`, `utilizationPct: 0`.
Money = `::text` strings (getDashboard convention); counts = numbers. Revenue aggregates from
`matches.pitch_cost_sar` only (never re-derived from hourly_rate).

**Admin.** `partner/earnings/page.tsx`: overview section above the table — 2 MetricCards
(4-week revenue, utilization), per-venue DataTable (identity/value roles), trend via the
EXISTING `WeeklyTrendChart` (mapped weekStart→date). All data through the existing
`useLiveAdminData('/partner/earnings')` call — no new fetch paths (hexagonal: apiFetch only).
i18n `partner.earnings.*` EN+AR parity.

**Gate 3 checklist (parent-side acceptance, lane output untrusted).**
- [ ] Lane jest green (partner specs incl. new spec) — parent re-runs on real install
- [ ] Empty-branch completeness pinned by test
- [ ] Scope isolation pinned (owner of 2 venues never sees a 3rd venue's row)
- [ ] tsc 0 (api + admin); turbo build 3/3 `--concurrency=1` (parent, real tree)
- [ ] i18n leaf parity EN=AR for the new keys
- [ ] Zero migrations

## Status
| Gate | Status |
|---|---|
| 0 Retro | ✅ (00-retro.md) |
| 1-3 Program design | ✅ this doc |
| 4 Slices | P2-174 built (PR #110) · P1-65 lane running |
