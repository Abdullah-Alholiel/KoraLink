# Run #20 — Gate 0 Retrospective: match scheduling lifecycle

Scope of audit: the exact area this cycle touches — match creation/booking/cancel (matches.service.ts) and the host/slot flow on the PWA.

## What exists (contracts verified live this run)

- `POST /matches` (createMatch :1142) — koralink mode: slot `FOR UPDATE` lock (:1198-1211) → insert match (`booking_slot_id`, `pitch_cost_sar` persisted :1225-1231) → mark slot booked (:1238) → wallet debit with balance check (:1245+). Slot time semantics: PWA derives `scheduled_at = riyadhISO(slot.slot_date, slot.start_time)` and `duration = end_time − start_time` (HostMatchForm.tsx:89-102,137-145); server re-derives both from the slot row (server-authoritative).
- `POST /matches/:id/cancel` (cancelMatch :1627) — host-only, Open/Full/InProgress, single tx: status → Cancelled, slot release (`is_booked=false, booked_match_id=null`), refund exactly `pitch_cost_sar` (never re-derived from price_per_player), ledger idempotency `refund-<matchId>`, `findOne` OUTSIDE tx, best-effort WS broadcast.
- **Gap (P1-13):** no update/reschedule route exists — `matches.controller.ts` route inventory (17 routes) has no PATCH/POST touching `scheduled_at`. Hosts must cancel + recreate: loses roster, chat, and re-queues payment. `POST /pitches/:id/slots` (pitches.controller.ts:31, player-facing) already serves free-slot reads — the reschedule picker needs NO new read endpoint.
- Scheduler interplay: `*/5m` auto-complete + auto-cancel both key off `matches.scheduled_at` — a reschedule that updates `scheduled_at` in the same tx as the slot swap keeps both ticks correct with zero scheduler changes.

## Tech debt / recent-commit audit

- fix:feat ratio last 12 commits: 7 fix / 4 feat / 1 docs ≈ 1.75:1 — reactive but explained: runs #18-#19 were verification+repair cycles. This cycle returns to feature work.
- Reviewer A (run #20) latent importants in the touched area: clubs/[id] hours row renders when only ONE of open/close defined (`||` guard, invents 0/24 defaults — schema notNull().default() makes it latent) → rider fix this cycle. `Date.now()`-in-render hydration class → already backlog (BOARD line 131), not re-fixed here.
- Standing bug-class sweep clean (Reviewer A): `::uuid` 0, `eq(col,null)` 0, console.* 0, i18n parity 679/679 PWA + 239/239 admin.

## Full-stack connectivity check for the planned feature

DB (`pitch_slots.is_booked/booked_match_id`, `matches.booking_slot_id/booking_mode/pitch_cost_sar` — all live since migration 0013 era) → API (`findOne` returns full columns, no projection) → adapter (`MatchDetailApi` already types `booking_mode`/`booking_slot_id`) → UI (none renders them yet — `Match` domain type lacks `bookingMode`/`pitchId`). The chain breaks exactly at the adapter→domain step; slice 2 extends it.

Verdict: PROCEED to Gate 1 (compact single-doc form in 01-program-design.md).
