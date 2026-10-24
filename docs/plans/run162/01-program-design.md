# Run #162 — Gates 1-3 compact + 00-status (P2-253 partner blackout UI)

## Gate 1 — Product spec (compact)
Problem: partners can close bookable slots only one-by-one (ScheduleDrawer/SlotManager); venue-wide closures (maintenance, Ramadan hours, holidays) are impractical and stale slots keep selling. The API (P2-246, PR #172) exists; the console does not.
User story: As a venue partner, I select a date range on my pitch's schedule and close all free slots in it with one confirmed action, so nobody can book during a closure; booked slots are explicitly reported as untouched.
Scope: UI-only (apps/admin partner surface). OUT: any API change, releasing booked slots (match-cancel flow's job), recurring series.
Success criteria: dialog validates from/to (to>=from; warn >62 days), destructive CONFIRM, loading state, localized success ("X slots closed") + skippedBooked warning, EN+AR parity, all calls via admin apiFetch, admin tsc + turbo build green.

## Gate 2 — Architecture (compact)
Files: apps/admin/src/components/ScheduleDrawer.tsx (entry action) + a BlackoutDialog component; i18n under partner namespace in messages/en.json + ar.json. Data flow: partner opens schedule → picks range → client validation → POST /partner/pitches/:id/slots/blackout via apiFetch → success/warning summary → schedule refresh.
No schema/migration. Risk: destructive delete UX → mitigated by CONFIRM + explicit counts. Reversal risk: none (additive UI on a live endpoint).

## Gate 3 — Program design (contract)
Endpoint contract (FROZEN, already live — from partner.service.ts:1349-1394):
- Request: POST /api/v1/partner/pitches/:id/slots/blackout, JSON { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } (inclusive, ≤62 days).
- 200: { "closedInstances": int, "skippedBooked": int }
- Errors: 400 invalid range/cap exceeded · 401 unauthenticated · 403 not your pitch · 404 pitch not found.
Frontend contract: apiFetch wrapper only; error mapping 400→range copy, 403/404→access copy, network→retry copy (error-message standard: what+why+next, localized).
i18n keys (partner namespace, en+ar): blackout.title, blackout.from, blackout.to, blackout.confirm, blackout.confirmHint, blackout.submit, blackout.submitting, blackout.success{n}, blackout.skippedBooked{n}, blackout.rangeError, blackout.tooLong, blackout.forbidden, blackout.notFound, blackout.networkError.
(Exact key names may adjust ± to the lane's chosen namespace — parity in BOTH locales is the invariant.)

## 00-status.md
| Gate | Name | Status | Approved | Artifact |
|---|---|---|---|---|
| 0 | Retrospective | ✅ DONE (autonomous) | auto | 00-retro.md |
| 1 | Product | ✅ DONE (autonomous) | auto | this doc |
| 2 | Architecture | ✅ DONE (autonomous) | auto | this doc |
| 3 | Program design | ✅ DONE (autonomous) | auto | this doc |
| 4 | Vertical slices | 🔄 IN PROGRESS | — | zeroshot lane 01a16e88 + parent gates |
