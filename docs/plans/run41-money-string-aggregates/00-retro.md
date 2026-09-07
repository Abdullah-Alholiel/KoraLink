# Run #41 — Gate 0 Retrospective: P2-4 money float casts

## Area audit (what the board item got wrong / right)

- **Board line numbers stale.** P2-4 cited `matches.service.ts:198, admin/users.service.ts:103,
  admin/settlements.service.ts:36,107,115`. Live grep found **15 `::float` sites** across 8 files
  (matches 692/711, users.service 156/158/749/763, admin users 132, settlements 37/122,
  transactions 47, pitches 52/82, admin matches 36, metrics 61/62/71/87, partner 247/336).
- **Empirical risk re-rating (2,000,005-case Python sweep):** numeric(12,2) → float64 →
  round-to-cents round-trip lost **0 fils in every case** up to the column max (9,999,999,999.99).
  Float64 carries 15–17 significant digits; these columns carry ≤12. The boarded "rounding risk"
  is theoretical at current scale. The REAL hazard class is **float accumulation**, which corrupts
  (proved: 1000×0.1 = 99.9999999999986) — the codebase avoids it only by accident (all SUMs run in
  Postgres, which sums numerics exactly).
- **The one money WRITE in the blast radius:** `admin/settlements.service.ts generatePending`
  casts `SUM(pitch_cost_sar)::float`, then JS-rounds `Math.round(row.amount*100)/100`, then
  `amount.toFixed(2)` into the `settlements.amount` numeric column. A float must not sit in the
  path that decides venue payout amounts.

## Prior art in-tree

- All money columns are `numeric(precision, 2)` (schema.ts:208,348,412,416,493,985). Drizzle
  returns numeric columns as **strings**; Postgres can hand the exact value straight through.
- `pgDialect.sqlToQuery` SQL-tripwire pattern (run #13 P1-21, run #39 dispute/venue contracts).
- settlements.service.spec.ts already mocks `db.execute` rows — extend, don't reinvent.

## Decision (recorded for 01-program-design)

Three tiers, not one blanket rewrite:

1. **Tier A (build now)** — money AGGREGATE reads on admin/partner surfaces (settlements list,
   transactions list, partner getDashboard total + getEarnings revenue, admin users totalSpent)
   → cast `::text`, type as string. Exact end-to-end; consumers (`formatMoney`) already accept
   `number | string`.
2. **Tier B (build now)** — `generatePending` string-in/string-out (no float ever; a tiny
   2dp string quantizer replaces `Math.round(row.amount*100)/100`).
3. **Untouched (rationale recorded)** — PWA display casts (users.service 156/749/763,
   matches.service 711: feed `number` props into `Intl.NumberFormat`), the max_price filter
   (comparison predicate), pitches/admin-matches single-row rates (column-typed, unaggregated),
   metrics `::float` (dashboard chart/`Number()`-coerced display aggregates; rate denominators).
   Re-rate only if fils-exact reporting becomes a product requirement.
