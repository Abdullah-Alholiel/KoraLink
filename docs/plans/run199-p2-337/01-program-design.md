# Run #199 — P2-337 — Gates 1–3 (compact single doc) + status

## Gate 1 — Product
**Problem:** A partner sees per-settlement badges but no aggregate pending/paid/voided split —
"when do I get paid?" needs admin help; voided settlements are invisible in aggregate.
**User story:** As a venue partner, on /partner/earnings I see status count chips
(pending N · paid N · voided N) and a payout-cadence line, so I can answer payment-timing
questions without contacting admin.
**Scope IN:** earnings page breakdown chips + cadence hint; API adds `statusBreakdown` counts
+ `payoutCadenceDays` to GET /partner/earnings. **OUT:** new filters, server pagination,
any mutation, admin settlements page.
**Success criteria:** chips render real counts (0-state included); cadence line shows the
LIVE PlatformSetting value; i18n EN+AR parity; all gates green.
**Open questions:** none (owner decision D-20261106-03 already covers void policy).

## Gate 2 — Architecture
- API: `getEarnings` aggregates counts client-of-SQL via a dedicated COUNT query
  (`COUNT(*) FILTER (WHERE status=...)` per status, ints) + PlatformSettingsService
  `getNumber('payout_cadence_days', 7)` (optional-injection guard, mirrors :176).
- Admin: pure client aggregation REMOVED in favor of the server counts (single source);
  chips reuse StatusBadge styling vocabulary (colored dot + status label from `status.*`
  ns) + counts with Arabic-Indic numerals via the app's number pipeline; cadence line
  under the settlements title (ICU plural for AR).
- Data flow: DB (settlements rows) → COUNT FILTER query + settings row → JSON fields →
  PartnerEarnings type → chips + hint. No adapter change (fields ride existing payload).

## Gate 3 — Program design (contract)
**API JSON (additive to GET /partner/earnings 200):**
```json
{
  "settlements": [...unchanged...],
  "totalPending": "40.00", "totalPaid": "0.00",
  "statusBreakdown": { "pending": 2, "paid": 5, "voided": 1 },
  "payoutCadenceDays": 7
}
```
- `statusBreakdown.pending|paid|voided: number` (int, ≥0, ALWAYS present — empty scope → all 0).
- `payoutCadenceDays: number` (fallback 7 when settings service undefined).
- Empty-scope early return must include both fields.
**TS:** `PartnerService.getEarnings(): Promise<{...; statusBreakdown: {pending:number;paid:number;voided:number}; payoutCadenceDays:number}>`; admin `PartnerEarnings` gains the two fields (optional-tolerant for pre-deploy server).
**Frontend:** chips derive ONLY from `data.statusBreakdown` (fallback `{}` when server lags); hint renders `t('cadenceHint', { days })`.
**i18n contract (partner.earnings ns, EN+AR):**
- `statusBreakdownTitle` = "Settlement status" / "حالات التسويات"
- `breakdownPending` = "{count, plural, =0 {No pending} one {# pending} other {# pending}}" / AR ICU plural
- `breakdownPaid`, `breakdownVoided` same shape
- `cadenceHint` = "Payouts run every {days, plural, one {day} other {# days}}." / "تُدفع المستحقات كل {days, plural, one {يوم} two {يومين} few {# أيام} other {# يوم}}." (ICU AR plural — count renders Arabic-Indic via next-intl)
**i18n parity:** leaf counts equal EN==AR (845-class check extended to admin).

## Contract verification checklist (Gate 3, explicit)
- [✓] No mutation endpoint touched — read-only additive fields.
- [✓] Frontend type can accept exact JSON: PartnerEarnings extended, breakdown optional-tolerant.
- [✓] Adapter: none needed (fields consumed directly; page guards with `?? 0`).
- [✓] No field silently undefined: both empty-scope and main returns carry both fields.
- [✓] i18n keys exist EN+AR before build; parity asserted in gates.

## 00-status
| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | — | 00-retro.md |
| 1 | Product Spec | ✅ DONE (autonomous) | — | this doc §Gate 1 |
| 2 | Architecture | ✅ DONE (autonomous) | — | this doc §Gate 2 |
| 3 | Program Design | ✅ DONE (autonomous) | — | this doc §Gate 3 |
| 4 | Vertical slices | IN PROGRESS | — | lane branch |
