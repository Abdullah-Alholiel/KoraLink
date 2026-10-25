# Run #163 — Gates 1-3 Compact: settlement-window unification package

**Board rows:** P2-216 (+ P2-221 fold, + P2-209 residue fold, + run-#163 Reviewer A IMPORTANTs)
**Lane:** DB & Infra (run# % 4 = 3) — money-path correctness, API-only.

## Gate 1 — Product

**Problem:** the same money source (completed KoraLink-booked match revenue per venue) is read by
two settlement paths with subtly different windows, locking, and date axes. Partners and admins can
see different unsettled amounts; two pending settlements can cover overlapping revenue; amounts
route through JS floats on the response path.

**User story:** as a venue partner, when I request a payout and an admin generates settlements in
the same window, exactly one pending settlement per venue covers each match's revenue — no overlap,
no gap, no double request — and the totals I see are exact to the halala.

**Scope:**
- IN: unify window bounds (rolling start instant + Riyadh-day end), tx-scoped SELECT + ordered
  venue lock on BOTH paths, Riyadh-day period bounds on both, SQL-SUM response totals (P2-221 +
  P2-209 half), getEarnings totals via SQL SUM, bare CURRENT_DATE → riyadh param on the 5 census
  sites (partner.service ×3, admin/pitches.service ×2), date helpers extracted to common utils.
- OUT: pay()/P0-2 money movement (owner-gated), settlement SLA sweep, admin UI changes, any schema
  or migration change (NONE in this package), i18n changes.

**Success criteria:** all gates green (tsc/jest/turbo/vitest untouched-count) + new spec coverage
for every changed contract + PR-Agent review clean of CRITICAL/IMPORTANT.

## Gate 2 — Architecture

Files (backend only):
| File | Change |
|---|---|
| `apps/api/src/common/utils/riyadh-date.ts` (NEW) | move `RIYADH_OFFSET_MS`, `riyadhDateString()`, `addDaysToDateString()`, `riyadhTrendDays()` out of partner.service (hex lane: common utils = no module boundary crossing); partner.service re-exports for spec compat |
| `apps/api/src/modules/partner/partner.service.ts` | requestPayout: lock `.orderBy(asc(venues.id))` BEFORE `.for('update')`; bounds = rolling start + riyadh param; interval-overlap NOT-EXISTS guard; period bounds `riyadhDateString()`; totalAmount via SQL SUM; getEarnings totals via aggregate execute; getDashboard ×3 riyadh param |
| `apps/api/src/modules/admin/settlements.service.ts` | generatePending: move revenue SELECT INSIDE the tx; add venues `LEFT JOIN` + `.orderBy(asc(venues.id)).for('update')` (SELECT … FOR UPDATE OF v is illegal with LEFT JOIN → INNER JOIN venues v, semantically identical here since a match's venue always exists); SAME bounds + SAME guard as partner (shared private helper); period bounds Riyadh |
| `apps/api/src/modules/admin/pitches.service.ts` | :57/:59 `CURRENT_DATE` → `${todayRiyadh}::date` bound param |
| specs (4 files extended + 1 new) | contract coverage per Gate 3 |

Data flow: unchanged externally (same endpoints, same shapes except totalPending/totalPaid number→
string — admin formatMoney already string-safe; types.ts:361 widened).

## Gate 3 — Program design (contracts)

### 1. POST /partner/payout-requests response — UNCHANGED shape
```json
{ "requested": 2,
  "totalAmount": "1322.50",
  "settlements": [{ "id": "set-…", "venueId": "v1", "venueName": "Riyadh Arena",
                    "amount": "1234.50", "periodStart": "2026-10-25", "periodEnd": "2026-10-25",
                    "status": "pending" }] }
```
Behavior deltas: (a) response total = SQL `COALESCE(SUM(amount),0)::numeric(12,2)::text` over the
inserted rows (comma-free, formatMoney/Number-safe) — never a JS float reduce; (b) upper bound =
`$riyadhEnd::date::timestamp AT TIME ZONE 'Asia/Riyadh'` with `$riyadhEnd` = riyadhDateString()
param (computed in JS — no server-timezone assumption); (c) period bounds both `riyadhDateString()`;
(d) venue lock ordered `ORDER BY id FOR UPDATE` (deadlock-safe multi-row locking).

### 2. POST /admin/settlements/generate response — UNCHANGED shape
`{ "generated": N, "settlements": [rows] }` — deltas: revenue SELECT is now tx-scoped (`tx.execute`),
venues INNER JOIN added for the FOR UPDATE lock, SAME window/guard SQL as the partner path (shared
`settlementRevenueQuery()` builder, parametrized), period bounds Riyadh-day.

### 3. GET /partner/earnings — totalPending/totalPaid: number → string ('1234.50')
New single aggregate query (no row fetch):
`SELECT coalesce(sum(amount),0) filter (where status='pending')::numeric(12,2)::text AS pending, … paid`
Empty → '0.00'. Consumer: earnings/page.tsx `formatMoney(data?.totalPending ?? 0)` — formatMoney
string-branches already; `?? 0` fallback only fires on undefined (hook loading), still valid.
types.ts:361 `totalPending: number` → `number | string`. PWA: zero references (grep-verified).

### 4. GET /partner (dashboard) — shapes unchanged
`todayUtilization` (COUNT filter on `slot_date >= $today::date` param) and `revenueToday`
(string, sum over `scheduled_at >= $today::date::timestamp AT TIME ZONE 'Asia/Riyadh' AND < +1d`)
— axis moves server-UTC → Riyadh; magnitudes unchanged at off-drift hours.

### 5. admin/pitches.service list — shapes unchanged; slot-count subqueries bound `${today}::date`.

### 6. TS signatures
```ts
// NEW common/utils/riyadh-date.ts (moved verbatim from partner.service)
export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
export function riyadhDateString(nowMs?: number): string;
export function addDaysToDateString(dateStr: string, days: number): string;
export function riyadhTrendDays(nowMs?: number): string[];
// partner.service (re-export for spec compat — verified consumers)
export { riyadhDateString, addDaysToDateString, riyadhTrendDays, RIYADH_OFFSET_MS };
// settlements.service private — the ONE window/guard source of truth
private settlementRevenueQuery(cadenceDays: number, riyadhEnd: string): SQL;
```

### 7. i18n contract
NO new keys (no UI change). EN+AR parity untouched.

## Gate 3 contract verification checklist (explicit, per §Gate 3)
- [✓] Mutations return fully populated objects — requestPayout returns per-row settlements (unchanged
      shape, verified above); generatePending unchanged. No findOne-style relation adds needed.
- [✓] Frontend types accept the exact JSON — settlements shapes untouched; earnings totals widened
      number|string and formatMoney handles strings (read: utils.ts:15-21).
- [✓] Adapter functions exist for every consumed shape — no new API shapes; no adapter changes.
- [✓] No silently-undefined field — totalPending/totalPaid now ALWAYS strings incl. empty branches;
      removed the number path so no consumer sees a type surprise (types widened, consumer
      formatMoney verified string-safe).
- [✓] i18n keys exist for every user-facing string — no user-facing string added/removed.

## Test plan (Gate 4 acceptance)
- settlements.service.spec: +3 (lock tiebreaker, tx-scoped SELECT, Riyadh bounds)
- settlements.money-window.spec.ts (NEW): window/guard SQL truth table (cadence window, Riyadh end,
  interval-overlap guard, no server-CURRENT_DATE) + lock-order + same-SQL-both-paths cross-check
- payouts.service.spec: +3 (Riyadh upper bound param, overlap guard predicate, SQL total)
- payouts contract addition: overlap guard beats single-bound (cadence-skew case)
- earnings-revenue.spec: fixture + expectations for the aggregate totals query
- money-string.spec: tx-chain fixture update; keep all existing assertions green
- Full gates: `npx turbo run build --concurrency=1` 3/3 · PWA vitest 1043/1043 · tsc 0 · jest 100%
