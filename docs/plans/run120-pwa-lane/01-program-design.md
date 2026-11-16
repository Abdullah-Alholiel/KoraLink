# Run #120 — Program Design (Gates 1-3 compact)

## Problem (Gate 1)
Saudi amateur football is a weekly ritual. Hosts re-create the same game by hand every week
(venue → pitch → slot → details → publish). P1-64: add "same time every week" to the host flow.
User story: *As a host, when booking a slot, I pick "Weekly ×4" and get 4 matches, one per week,
same pitch/time — my wallet is debited once per week and I see all 4 in My Games.*

Scope IN: koralink booking mode only; repeat 1-8 weeks; chips Once/×2/×4/×6/×8; per-week wallet
debit with one guarded debit per slot; single API call; response = first match (populated).
Scope OUT: self-mode recurring (400), custom intervals, monthly repeats, recurring from a partner
template, editing/cancel propagation across instances (each instance is a normal match — existing
cancel already refunds its own slot), push/notification changes.

Success criteria: N matches + N booked slots + N ledger rows (per-slot keys) in ONE tx; wallet
short by exactly N × cost on success; any single missing/taken/past slot → 409/400 and NOTHING
written; UI chips localized EN+AR with aria-pressed; deposit preview shows the multiplied total.

## Architecture delta (Gate 2)
No schema change, no migration, no new table. `pitch_slots` already carries all weeks (partner
generateSlots horizon covers 8 weeks). Flow inside the existing koralink branch of `createMatch`:
resolve N candidates BEFORE the tx (fail fast, name the offending date) → ONE tx locking ALL N
slots `FOR UPDATE` → per-slot: insert match, mark slot booked, guarded wallet debit, ledger insert
`slot-booking-<slotId>` → host into each match_players → `findOne(first)` OUTSIDE tx.

Files changed:
- API: create-match.dto.ts (+repeat_weeks), matches.service.ts (recurring resolution + tx loop).
- PWA: HostMatchForm.tsx (repeat chips, deposit ×N, sheet breakdown), useMatches.ts Zod client
  schema (+repeat_weeks optional 1-8), messages/en.json + ar.json (host.repeat.* 5 keys).
- Tests: matches.recurring.spec.ts (new), host-repeat.test.ts (new structure test).

## Contracts (Gate 3)
- API request: existing CreateMatchDto + `repeat_weeks?: number (int, 1..8, optional)`.
- API response: UNCHANGED populated Match shape (`findOne(firstMatchId)`) — clients navigate to
  the first instance; later instances surface in My Games. 400s: `No slot available on <date>`
  / `Recurring matches require KoraLink booking.` / past-start names the date. 409: `Slot on
  <date> is already booked.`
- scheduled_at derivation: `new Date(\`${slot_date}T${start_time.slice(0,5)}:00+03:00\`)` — the
  exact reschedule-path mapping (Riyadh DST-free).
- Hook: useCreateMatch payload += `repeat_weeks`; mutation response type unchanged.
- i18n keys (both locales, 5): `host.repeat.once`, `host.repeat.weekly2`, `host.repeat.weekly4`,
  `host.repeat.weekly6`, `host.repeat.weekly8`.

## Gate 3 contract verification checklist
- [x] Mutation returns fully populated object (first instance via findOne outside tx).
- [x] Frontend types accept the JSON (response shape untouched; payload field optional → old
      clients unaffected).
- [x] Adapter functions unchanged (MatchCard/hook shapes untouched).
- [x] No silently-undefined field (repeat_weeks absent = 1 = single match, behavior identical).
- [x] i18n keys exist in BOTH locales before build (5 keys ×2, parity pinned by structure test).

## Companion fix (Reviewer B IMPORTANT, same run)
Clubs filter pills get `aria-pressed={activeFilter === filter}` (page.tsx:249-260) — design-lens
a11y standard; zero behavior change for sighted users.

## Slices (Gate 4)
1. API: DTO + recurring resolution + tx loop + recurring spec (jest) → build green.
2. PWA: chips + deposit math + sheet breakdown + Zod + i18n + structure test → build + vitest green.
3. Companion aria fix + full gates → PR → bot checks → squash-merge.
