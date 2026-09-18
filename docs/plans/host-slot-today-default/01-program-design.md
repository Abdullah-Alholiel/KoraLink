# Host a Match — Slot Picker: Today-Default + Past-Slot Filtering

Owner directive (Abdullah, 2026-09-18): on the host form (booking via us), slots must
show **immediately for today** (no date pick required first), **past slots must never
show** (at 19:00 a 16:00–17:00 / 17:00–18:00 slot is dead), and the whole surface must
be a **standard dynamic form** streaming club slot availability (admin/partner-managed
`pitch_slots`) depending on the current time.

## Gate 0 — Retro (area audit)

- `SlotPicker.tsx` (host form): `useState(initialDate ?? '')` → **empty default**; the
  slots grid renders only `{slotDate && …}` → user must pick a date first (bug 1).
  No past-slot concept anywhere client-side (bug 2).
- `GET /pitches/:id/slots` → `MatchesService.getPitchSlots` (matches.service.ts:2148):
  filters `pitch_id + slot_date` only → **serves past slots** (bug 2 root).
- `createMatch` koralink branch (matches.service.ts:1990-2008): rejects `is_booked`
  only → a stale client can book an already-started slot at publish time (related hole).
- In-repo precedent: `RescheduleSheet` ALREADY defaults `todayInRiyadh()` + uses the
  shared day strip (`components/matches/DatePicker`) — the host picker predates it.
- Data source is already dynamic: admin/partner manage `pitch_slots`
  (generateRecurringSlots + admin pitch/slot surfaces) → this cycle only fixes the
  read/filter/display path. No schema change.
- Recent lane commits: wallet-pay removal (16dd5f9), stats strip two-up (251a5fd) —
  no overlap. Tech debt noted: SlotPicker lacked error UX (5-states gap) — fixed here.

## Gates 1–3 — Program design (compact)

**User story:** as a host booking via KoraLink, I open the host form, pick a pitch,
and immediately see today's REMAINING bookable slots; I can switch days via the same
day strip used everywhere else; slots that already started never appear, and if one is
somehow submitted the server rejects it with a localized message.

**Contract (API):**
- `GET /pitches/:id/slots?date=YYYY-MM-DD`:
  - `date < riyadhDateKey()` → `[]` (past days never served).
  - `date == riyadhDateKey()` → only rows with `end_time > riyadhTimeNow()` (Riyadh
    wall clock via Intl, Asia/Riyadh — matches lib/venue-hours.ts convention).
  - future dates unchanged. Wire shape unchanged (additive behavior only).
- `POST /matches` (koralink mode): slot SELECT gains `slot_date, start_time`; reject
  with `409 ConflictException('This slot has already started…')` when
  `slot_date < today || (slot_date == today && start_time <= now-1min grace)`.

**PWA:**
- `SlotPicker`: drop internal date state + `DateTimeOverlayInput` + `initialDate`
  prop → effective date = `selectedDateKey ?? todayInRiyadh()`; render the shared
  `DatePicker` strip (`fireOnMount={false}`, controlled `selectedDate`); day change
  clears the chosen slot (existing behavior). Hook auto-fetches today's slots on
  pitch selection (no tap needed).
- `host/page.tsx`: stop passing `initialDate={dateFromQuery}` (today-default replaces
  the cross-screen date carry; venue pre-selection param untouched).
- Add error state + retry to the slots section (5-UX-states standard).
- `publish-error.ts`: add `slot_started` kind → `host.errorSlotStarted` (EN+AR).
- Remove now-dead key `host.pickDateFirst` (both locales).

**i18n:** `host.errorSlotStarted` added EN+AR; `host.pickDateFirst` removed EN+AR.

**Verification gates:** api tsc + jest (new specs), pwa tsc + vitest (new SlotPicker
suite), `turbo run build` 3/3, `bash scripts/deploy-staging.sh`, live probes:
past-date → `[]`; today → no `end_time <= now` rows; publish guard via spec.

## Gate 4 outcome (2026-09-18, interactive cycle)

- ALL GATES GREEN: api tsc 0 + jest 9/9 (matches.pitch-slots-filter +
  matches.default-booking-mode incl. boundary-mirror case) · pwa tsc 0 +
  vitest 85 files / 607 tests (new slot-picker suite, clock-robust §19
  fixtures) · turbo 3/3 exit 0.
- Commit `686e383` on staging (pushed, remote verified).
- **DEPLOY PENDING OWNER DECISION:** services run from the projects dir
  (feature lane), not the staging worktree — `deploy-staging.sh` from the
  worktree cannot reach them. Live probe against the running API showed the
  old unfiltered behavior (yesterday [] ✅ came from the short-circuit being
  absent too — i.e. fully old dist). Options recorded in the factory-loop
  skill; awaiting Abdullah: repoint units to the worktree (recommended) vs
  merge staging → feature per deploy. No further code work needed.
