# Settlement void path — Gates 1–3 compact (run #195, 2026-11-08)

## Gate 1 — Product
**Problem:** a duplicate/erroneous PENDING settlement row (double-generate race survivor,
wrong window, wrong amount from a data fix) can only be reversed by direct DB writes —
no admin UI, no API, no audit trail. Money-adjacent surface with an operator blind spot.

**Owner policy (Life OS D-20261106-03, 2026-11-07):** void pending only, with audit trail.

**User stories:**
- US-1 (admin, P0): as an HQ operator I can void a PENDING settlement from the settlements
  drawer with an explicit confirmation, and the row shows Voided afterward.
- US-2 (admin, P0): voiding never touches paid/failed rows — the action is not rendered.
- US-3 (money-truth, P0): after a void, the same venue window CAN be re-settled: the next
  generator run (admin or partner-requested) recreates the settlement for that window.
- US-4 (compliance, P0): every void writes an audit row (settlement.void) with before/after,
  acting admin id, and IP.
- US-5 (finance, P2): voided rows remain visible/filterable in the settlements list (raw
  status=voided filter works) — history is never hidden.

**Scope IN:** enum value + migration, POST /admin/settlements/:id/void (guarded, audited),
revenue-guard exclusion, partial unique index, admin drawer action + confirm, i18n EN+AR,
specs. **Scope OUT:** editing amounts, void-after-paid (never), partner-facing void UI,
notification fan-out on void (ops sees it in the audit + list), CSV shape changes.

**Success criteria:** void works E2E live on staging; paid/voided → 409; re-settlement of a
voided window succeeds; audit row lands; all gates green.

## Gate 2 — Architecture
- **DB (migration 0059):** (1) `ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'voided';`
  (per-file-tx-safe per the 0026/0027/0028 precedent; safe against legacy rows via IF NOT
  EXISTS). (2) DROP the full `settlements_venue_period_uidx`; CREATE UNIQUE INDEX
  `settlements_venue_period_open_uidx` ON settlements (venue_id, period_start)
  WHERE status <> 'voided' — an open (pending/paid/failed) row keeps blocking duplicates,
  a voided row frees its window. No-op-safe ordering (drop-then-create-unique preserves the
  existing uniqueness property at every instant).
- **API:** AdminSettlementsService.void(id, adminId, ip) — mirror pay(): findOne → 400 on
  non-pending (void only while pending) → conditional UPDATE `WHERE id AND status='pending'`
  SET status='voided' → 0 rows = 400 (concurrent-flip race, same TOCTOU posture) → findOne
  OUTSIDE tx → audit settlement.void (before/after) → broadcastOps('settlements').
  Controller: POST :id/void, @Throttle MONEY_OP_THROTTLE (10/min), UuidParamPipe.
- **Money-source:** buildSettlementRevenueQuery NOT EXISTS guard gains
  `AND s.status <> 'voided'` — a voided row no longer blocks its window.
- **Admin UI:** drawer actions render Void (destructive style, opens ConfirmDialog with a
  localized warning listing the amount + irreversibility) alongside Pay, only when
  status==='pending'; voidFailure alert = the moneyActionFailure buckets (P2-267 pattern);
  Settlement.status type widens to include 'voided'; filter gets a Voided option;
  StatusBadge gains a voided style + KNOWN entry; audit page entity filter untouched
  ('settlement' already whitelisted).
- **Files:** schema.ts (enum + partial index), drizzle/0059 + journal + snapshot copy,
  settlements.service.ts/.controller.ts, dto/list-settlements.dto.ts, settlement-revenue.ts,
  settlements.service.spec.ts (void cases), settlements.provenance.spec.ts (guard render),
  metrics.service.spec.ts (tripwire if present else a grep pin in money-routes spec — NO:
  keep it in settlements.provenance.spec.ts), admin types.ts + settlements/page.tsx +
  StatusBadge.tsx, messages en/ar.

## Gate 3 — Contracts (exact shapes)
**POST /admin/settlements/:id/void** (AdminAuthGuard, 10/min) → 200:
```json
{ "id": "uuid", "venue_id": "uuid", "amount": "25.00", "period_start": "2026-11-01",
  "period_end": "2026-11-08", "status": "voided", "payout_ref": null, "requested_by": null,
  "requested_by_name": null, "paid_at": null, "created_at": "…", "venue": { "id": "uuid", "name": "…", "city": "…" } }
```
(Drizzle findFirst relation shape — camelCase keys; amount numeric → string; venue = the
findOne({ venue: { id, name, city } }) projection.)
Errors: 400 "Only pending settlements can be voided." (paid/failed OR lost race);
404 "Settlement not found."; 401/403 per guard. TS signature:
`async void(id: string, adminId: string, ip?: string): Promise<SettlementRow>` (populated row,
mirrors pay()). Audit entry: `{ action: 'settlement.void', entityType: 'settlement',
entityId: id, before: <pre-row>, after: <post-row>, ip }`.
Admin UI state: `voidFailure: MoneyActionFailure | null` (drawer-scoped, resets on
selected?.id change), ConfirmDialog copy keys below.
**i18n (admin messages, EN + AR, hq ns + status ns):**
`hq.voidAction` ("Void"), `hq.voidConfirmTitle`, `hq.voidConfirmBody` (amount + period
interpolation), `hq.voidConfirmLabel`, `hq.voidCancel`, `hq.voidFailedAuth/Access/Conflict/
Server/Network`, `status.voided`. Parity: en leaves == ar leaves (832→841).

## Gate 3 contract checklist
- [✓] Mutation returns the fully populated row (findOne after the guarded write, outside any tx) — pay() precedent.
- [✓] DTO: ListSettlementsDto.status enum gains 'voided' (filter parity); void takes NO body DTO (id-only route).
- [✓] No field silently undefined: void() returns findOne() (same projection pay() returns).
- [✓] i18n keys exist for every new user-facing string, EN+AR, parity-checked programmatically.
- [✓] Money aggregates: pending_payouts stays correct (SUM WHERE status='pending'); revenue guard excludes voided; pin both.
