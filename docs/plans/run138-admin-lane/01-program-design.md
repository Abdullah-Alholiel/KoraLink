# Run #138 — Gates 1–3 Program Design (both items)

## Item 1 — P2-209 (new): Partner earnings money-path corrections (Reviewer-A IMPORTANT duo)

**Problem.** Partner dashboard "today" revenue and earnings totalsPending/Paid are
computed inconsistently with the endpoint's own Riyadh conventions, and money is summed
in JS floats.

**Scope.** apps/api/src/modules/partner/partner.service.ts ONLY (getDashboard +
getEarnings). No route/DTO/adapter/UI changes (shapes unchanged — values only).

### Gate 3 contract (exact)
- `GET /partner/dashboard` — `revenueToday: string` (numeric(12,2)::text, "1234.50").
  Empty-state branch (L285-292) aligns from `revenueToday: 0` (number) to `"0.00"`
  (string) — fixes the MINOR type-lie too. All other fields unchanged.
- `GET /partner/earnings` — `totalPending: string`, `totalPaid: string`
  (numeric(12,2)::text each). `settlements` rows unchanged.
- Admin consumers `formatMoney(string|number)` (apps/admin/src/lib/utils.ts:15) accept
  both — display unchanged for en/ar, Latin digits preserved.

**Implementation.**
1. getDashboard revenueToday:
   `${matches.scheduled_at} >= (CURRENT_DATE AT TIME ZONE 'Asia/Riyadh')
    AND ${matches.scheduled_at} < ((CURRENT_DATE + 1) AT TIME ZONE 'Asia/Riyadh')` —
   same axis idiom as getEarningsRevenue's inWindow. Scope kept MINIMAL: replace ONLY
   the day predicate (UTC→Riyadh); do NOT add status semantics beyond what existed
   (the original had no Cancelled exclusion — out of scope here).
2. getEarnings totals: replace the JS reduce with two scalar SQL SUMs:
   `SELECT COALESCE(SUM(amount),0)::numeric(12,2)::text AS total FROM settlements WHERE
    venue_id = ANY(...) AND status = 'pending'` (and 'paid'). Drizzle sql`` with
    inArray on settlements.venue_id. Drop the full rows fetch? NO — rows feed the table;
   keep the fetch as-is, only replace the two reduce computations.
3. Types: getEarnings return totalPending/totalPaid become string.

**Tests (jest, apps/api).**
- partner.earnings-revenue.spec.ts style: SQL-capture stub (PgDialect) asserting the
  executed revenueToday query contains `AT TIME ZONE 'Asia/Riyadh'` and
  `CURRENT_DATE` (regression: UTC-day), and the totals query contains
  `::numeric(12,2)::text` + status filters (regression: JS float reduce).
- Value path: stub execute returns [{total:"1234.50"}] → returns "1234.50" string.
- Empty-state: dashboard with no venues returns revenueToday === "0.00" (string).

## Item 2 — P2-3: Partner-initiated payout request

**Problem.** Partner earnings view is read-only (partner.service.ts:374-405 pre-P1-65
era); partners cannot request a payout; settlements are admin-generated on a 7-day
cadence only. Partner sees money earned but has no action.

**User story.** As a venue owner I open Earnings, see my available pending balance, tap
"Request payout", and the system creates ONE pending settlement request for my venues'
unsettled completed-booking revenue. HQ sees it in Settlements (status=pending) and pays
it through the existing pay flow. Nothing is paid out without admin action (P0-2
untouched; DECISIONS.md-compatible).

**Scope IN.** API: POST /partner/payout-requests (service method creating pending
settlement rows per venue in ONE tx, FOR UPDATE row lock on the partner's venue rows,
server-authoritative amount from Completed koralink matches, live cap check). Admin UI:
a "Requested" chip/filter on settlements + request-origin note in RecordDrawer. PWA-side
partner console: button on /partner/earnings with confirm + 5 UX states. i18n en+ar.

**Scope OUT.** No bank payout execution (P1-14/P0-2 untouched), no PSP, no new tables
(reuses settlements), no emails (P1-41 log-only), no SLA timer.

**Key design decisions.**
- Amount: SUM(matches.pitch_cost_sar) over Completed koralink matches scheduled in the
  window NOT already covered by an existing settlement for that venue (same
  NOT-EXISTS predicate shape as generatePending, per-venue). period = [windowStart..
  today Riyadh]. All-venue single amount aggregated into ONE settlement per venue with
  pending unsettled revenue (matches admin mental model: one PO per venue).
- Zero-revenue guard: venues with 0 unsettled → 400 problem+detail error; partner sees
  "nothing to request".
- Race: `SELECT ... FOR UPDATE` on venues rows (partner scope) inside tx (P2-105
  pattern) — serializes vs concurrent requests; admin generatePending's NOT-EXISTS +
  unique(venue_id, period_start) conflict target closes the double-insert gap (unique
  index exists? — run #4 fixed generatePending with onConflictDoNothing on
  unique(venue_id, period_start) → settlement UI labels the row "Requested" via
  created-by marker; settlements table has no origin column — USE payout_ref? No —
  payout_ref is set at pay time. **Origin marker: audit log + P2-3 UI note lists
  requested settlements by matching period_end = today**; admin UI chip derives from
  period_end == request day. NO schema change.)
- Live gate: cap unsettled lookback at 365 days; amount quantized
  quantizeMoney2dpString; never trust client amounts (request body = {} empty).
- Observability: Pino via existing logger; audit.log('partner.payout_request') on
  create; realtime.broadcastOps('settlements') so HQ list refreshes live; PostHog
  trackEvent partner_payout_request from admin/partner UIs.

### Gate 3 contract (exact)
Request `POST /api/v1/partner/payout-requests` body `{}` (all server-derived):
- 201 → `{ requested: <n>, settlements: [{ id, venueId, venueName, amount, periodStart,
  periodEnd, status:'pending' }], totalAmount: "1234.50" }`
- 400 `{"message":"No unsettled revenue available.","error":"No unsettled revenue"}` when
  all venues have zero unsettled completed revenue.
- 403 non-owner (RolesGuard VenueOwner; Admin forbidden — admin has generatePending).
- Adapter: PWA partner earnings hook `requestPayout()` → toast success
  `partnerPayout.requested` (EN+AR) / problem error per error-message standard
  (what+why+next). Admin settlements list: filter chip `requested` + drawer note when
  `period_end === today(Riyadh)` string.

**i18n keys (en/ar, leaf-parity).**
- PWA partner ns: `payout.requestCta`, `payout.confirmTitle`, `payout.confirmBody`,
  `payout.requested`, `payout.nothingToRequest`, `payout.failed`.
- Admin hq ns: `settlementsRequestedChip`, `settlementsRequestedNote` (+ar mirrors).

**Tests.** API jest: contract spec (201 shape, 400 empty, 403 role, FOR UPDATE lock
present in captured SQL, NOT-EXISTS predicate in captured SQL, amount ::numeric text);
admin vitest (if admin vitest absent — jest? check package.json: NO test script → skip
admin unit tests, verify via tsc + build + manual live E2E probe)…

## Verification plan (both items)
- `unset NODE_ENV && npx turbo run build --concurrency=1` zero errors.
- `cd apps/api && npx jest src/modules/partner` all green (new + existing).
- `cd apps/player-pwa && npx vitest run` grep 'Test Files … passed'.
- `npx tsc --noEmit` admin + pwa.
- Live probe (box): dev-login seed 0003 (VenueOwner) → POST payout-requests → 201;
  second call → 400 nothing-to-request; admin settlements list shows pending row.

## LANE/BRANCH
- Item 1 ships on `lane/run138-p2-209` → PR → staging.
- Item 2 ships on `lane/run138-p2-3` → PR → staging.
- No direct code pushes to staging.
