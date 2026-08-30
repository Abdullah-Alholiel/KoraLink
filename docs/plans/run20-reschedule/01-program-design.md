# Run #20 — Program Design (Gates 1–3 compact)

Two board items, both vertical-sliced below.

---

## Item 1 — P1-13: Match reschedule (host moves a match to a new slot, roster preserved)

### Problem
Hosts who need to move a match must cancel + recreate → roster wiped, chat lost, payment re-queued. (Board P1-13.)

### User story
As a host with an upcoming koralink match, I can pick a new free slot on the same pitch and the match moves there — roster, chat and title intact, old slot released and refunded, new slot booked and charged for the exact difference.

### Scope
IN: koralink-mode matches only; pre-match statuses Open/Full; same-pitch slot move; old→new slot swap in one tx; wallet charge/refund of the exact delta (ledger idempotent per attempt); roster notified (activity `match_rescheduled` + push); PWA "Reschedule" entry on match detail (host, pre-match) + RescheduleSheet reusing `usePitchSlots`/`SlotPicker` summary idiom; i18n en/ar.
OUT: self-mode matches (no slot, time free-edit is a separate decision), moving across pitches/venues, Post-creation format/roster edits, notification payload i18n (P2-8 standing).

### Architecture delta (files)
| Layer | File | Change |
|---|---|---|
| API | matches.service.ts | NEW `rescheduleMatch(userId, matchId, dto)` |
| API | dto/update-match-schedule.dto.ts | NEW: `booking_slot_id` varchar-36 required |
| API | matches.controller.ts | NEW `PATCH /matches/:id/schedule` |
| API | schema.ts + migration | NEW ActivityVerb `match_rescheduled` (ADD VALUE IF NOT EXISTS) |
| PWA | types/index.ts | `Match` += `bookingMode?`, `pitchId?` |
| PWA | api-adapter.ts | adaptMatchDetail maps both |
| PWA | useMatchActions.ts | NEW `useRescheduleMatch()` |
| PWA | RescheduleSheet.tsx | NEW bottom sheet (slot list + confirm) |
| PWA | match/[id]/page.tsx | Reschedule button (host, Open/Full, koralink) + sheet wiring |
| PWA | messages en/ar | `reschedule.*` keys (parity) |
| Tests | matches.reschedule.spec.ts | NEW API specs |
| Tests | test/components/RescheduleSheet.test.tsx | NEW PWA specs |

### Exact API contract (Gate 3)

`PATCH /api/v1/matches/:id/schedule` — cookie auth (JwtCookieAuthGuard), host only.

Request: `{ "booking_slot_id": "36-char id of a FREE slot on the match's current pitch" }`

Success 200 — fully populated `findOne(matchId)` (contract §2), plus `reschedule: { old_slot_id, new_slot_id, wallet_delta_sar: number }`:
```json
{ "id": "…", "title": "…", "status": "Open", "scheduled_at": "2026-09-02T18:00:00.000Z",
  "duration_mins": 90, "booking_mode": "koralink", "booking_slot_id": "new-slot-36",
  "host": {…}, "pitch": {…}, "players": […], "messages": […],
  "reschedule": { "old_slot_id": "…", "new_slot_id": "…", "wallet_delta_sar": -12.5 } }
```
Errors: 404 match/slot not found · 403 not host · 400 non-koralink / status not Open/Full · 409 slot taken · 400 insufficient balance.

TS signatures:
```ts
// matches.service.ts
async rescheduleMatch(userId: string, matchId: string,
  dto: UpdateMatchScheduleDto): Promise<ReturnType<MatchesService['findOne']>>
// useMatchActions.ts
export function useRescheduleMatch(): {
  mutate: (v: { matchId: string; bookingSlotId: string }) => void; isPending: boolean;
}
```

Server-side semantics (single `db.transaction`):
1. Lock both slots `FOR UPDATE` (old via match row's `booking_slot_id`, new via dto id) — read match FOR UPDATE row lock first: host check, status ∈ {Open, Full}, `booking_mode='koralink'`, `booking_slot_id` non-null; new slot must belong to `match.pitch_id`, `is_booked=false`, `id ≠ old`.
2. Derive `newScheduledAt = (slot_date, start_time)` Riyadh → UTC; `newDuration = end−start` mins (exact createMatch semantics — scheduler keys off scheduled_at, stays correct with zero scheduler changes).
3. Release old slot (`is_booked=false, booked_match_id=null`) + refund old `pitch_cost_sar` (ledger CREDIT, ref RESCHEDULE_REFUND, idem `reschedule-refund-<matchId>-<newSlotId>`); book new slot (`is_booked=true, booked_match_id=matchId`) + charge new pitch cost = `round2(rate × newDuration/60)` (ledger DEBIT, ref RESCHEDULE, idem `reschedule-charge-<matchId>-<newSlotId>`); net wallet movement = charge − refund applied to host `wallet_balance` with balance floor check (400 if insufficient).
4. Update match: `scheduled_at`, `duration_mins`, `pitch_cost_sar` (server-authoritative), `booking_slot_id=new`, `price_per_player = round2(newCost/(max−1) + 5)` — mirrors createMatch pricing, pinned by existing pricing test.
5. COMMIT → `findOne(matchId)` OUTSIDE tx → `activitiesService.record({ actorId: hostId, verb: 'match_rescheduled', matchId, recipients: roster (excludeActor: true) })` + `sendPushToUsers` (roster, best-effort try/catch) → WS `broadcastStatusUpdate` (best-effort).

Migration: `0027` one `ALTER TYPE ActivityVerb ADD VALUE IF NOT EXISTS 'match_rescheduled'` — code committed BEFORE db:migrate (Phase 4.5 rule).

i18n keys (en/ar, parity): `reschedule.title`, `reschedule.description`, `reschedule.pickSlot`, `reschedule.noSlots`, `reschedule.confirm`, `reschedule.summary`, `reschedule.delta` ({-amount} → "+/-SAR x"), `reschedule.notReschedulable`, `match.reschedule` (button label), `toast.rescheduled` / error fallback reuses `common.error`.

### Gate 3 contract verification checklist
- [✓] Mutation returns fully populated `findOne` OUTSIDE tx (matches cancelMatch/removePlayer pattern).
- [✓] `MatchDetailApi` already accepts the JSON (booking_mode/booking_slot_id typed :60-61; findOne has no column projection); new `reschedule` block is additive, consumed only by the sheet's summary.
- [✓] Adapter exists: adaptMatchDetail extended (bookingMode, pitchId) — no new adapter needed.
- [✓] No silently-undefined field: `Match` type gets optional `bookingMode?`/`pitchId?` — page gates on them before rendering the button.
- [✓] i18n keys added to BOTH en.json and ar.json (parity asserted by run's gate script).
- [✓] All id comparisons `::text`/varchar(36) (no `::uuid` anywhere).
- [✓] Money: ledger rows idempotent per (match, new-slot); refund from persisted `pitch_cost_sar` (never re-derived).

---

## Item 2 — Rider fix: clubs/[id] hours row `||` guard (Reviewer A run #20)

 clubs/[id]/page.tsx:206 renders when EITHER open/close defined → invents 0/24 for the missing one. Schema `.notNull().default()` makes both always present in practice (latent). Fix: `&&` guard (render only when BOTH defined) — preserves the "never invent hours" invariant. One-line + test tweak. No API/i18n change.

---

## Item 3 — P2-31(1): admin venues NaN guard (queued if budget remains)

partner/venues/page.tsx:85-86 `Number(editValues.open)` with empty select → NaN→JSON null, client skips close>open rule. Guard: empty/NaN → omit the field from the payload (server keeps existing). Two-line client fix.
