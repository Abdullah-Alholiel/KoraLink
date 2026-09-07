# Run #41 — Gates 1–3 Program Design: P2-4 money string aggregates

## Gate 1 — Problem & user story
Admins/partners see venue payout and ledger totals computed through IEEE-754 floats. Today the
round-trip is fils-exact (proved empirically), but the money **write** (`generatePending`) and
the aggregate **reads** that feed payout screens rely on that accident. Any future aggregation
change reintroduces silent fils drift. **User story:** as a venue owner, my settlement amount is
the exact sum Postgres computed — never a float-rounded value.

## Gate 2 — Scope
**In:** 7 aggregate cast sites (settlements list + generatePending source, transactions list,
partner getDashboard total, partner getEarnings weekRevenue, admin users totalSpent) + SQL
tripwire specs.
**Out (rationale in 00-retro.md):** PWA display casts, max_price filter predicate, pitches
hourly_rate, admin matches price, metrics dashboard aggregates (display-only, Number()-coerced),
avg_resolution_hours (a duration, not money).

## Gate 3 — Architecture delta & contracts

### Exact SQL changes (raw-SQL sites)
| Site | Before | After |
|---|---|---|
| settlements.service list :37 | `s.amount::float AS amount` | `s.amount::text AS amount` |
| settlements.service generatePending :122 | `COALESCE(SUM(m.pitch_cost_sar),0)::float AS amount` | `... ::text AS amount` |
| transactions.service list :47 | `t.amount::float AS amount` | `t.amount::text AS amount` |
| admin/users.service stats :132 | `COALESCE(SUM(amount),0)::float AS "totalSpent"` | `... ::text AS "totalSpent"` |
| partner.service getDashboard :247 | `coalesce(sum(pitch_cost_sar),0)::float` | `coalesce(sum(...),0)::text` |
| partner.service getEarnings :336 | `COALESCE(SUM(...),0)::float AS revenue` | `... ::text AS revenue` |

### Drizzle select sites (partner :247) — result typing
`total: sql<number>` → **`total: sql<string>`**. Consumer check: getDashboard returns it to the
admin dashboard `getEarnings`-shaped view (`revenueToday` style formatMoney consumers — verified
`formatMoney(value: number | string | null | undefined)` at apps/admin/src/lib/utils.ts:15).

### generatePending money-write path (no float)
```ts
// Postgres returns exact "1234.50" strings for numeric SUM. Quantize to 2dp as strings:
function quantizeMoney2dp(raw: string | number | null | undefined): string {
  const s = String(raw ?? '0').trim();
  const m = /^-?\d+(\.\d{1,2})?$/.exec(s) ?? /^(-?\d+)\.(\d)$/.exec(s);
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = (m ? s.replace('-', '') : '0').split('.');
  const pad = (frac + '00').slice(0, 2);
  const roundDigit = (frac + '00')[2]; // 3rd decimal, if any
  const cents = Number(intPart) * 100 + Number(pad) + (Number(roundDigit) >= 5 ? 1 : 0);
  const out = (cents / 100).toFixed(2);
  return neg ? `-${out}` : out;
}
```
Simpler final form (chosen): keep Postgres SUM at scale 2 (numeric(12,2) SUM = 2dp exactly),
so `row.amount` is already `"1234.50"` — the quantizer degenerates to a normalize-guard:
**if the string doesn't match `/^-?\d+\.\d{2}$/`, fall back to the old Number() path** (defensive
only; unreachable for numeric(12,2) SUM). `Math.round(row.amount * 100) / 100` is removed.

### TS signature deltas
- `generatePending` rows type: `Array<{ venue_id: string; amount: number }>` →
  `Array<{ venue_id: string; amount: string }>`.
- `totalSpent` local type `Array<{ totalSpent: number }>` → `Array<{ totalSpent: string }>`,
  returned as-is (admin types.ts `totalSpent?: number` → `number | string`; consumer
  `formatMoney(data.totalSpent ?? 0)` unchanged).
- partner getDashboard: `total: sql<string>` (call sites render via formatMoney).
- No PWA contract changes (Tier-out).

### i18n keys
None. No UI copy changes.

### Observability
No new Sentry/Pino/PostHog wiring required — read-model change only; the write path keeps its
existing audit + Pino logs (amounts now logged as exact strings).

## Gate 3 contract-verification checklist
- [x] Every changed surface's consumers enumerated (formatMoney accepts string; admin types updated)
- [x] No PWA contract change (feed/roster casts untouched)
- [x] Write-path parity: guard `amount <= 0 → continue` re-validated against string compare
      (`Number(row.amount) <= 0` kept for the guard — comparisons may use Number, the STORED value
      must be the exact string)
- [x] Spec plan: extend settlements.service.spec.ts (string-path insert values, tripwire on the
      generatePending SQL, quantizer edge cases), + new partner aggregate tripwire case
- [x] Migration needed: **none** (cast-only change; no schema/DDL)
- [x] Budget: ~45-60 min implementation + gates — fits remaining run budget
