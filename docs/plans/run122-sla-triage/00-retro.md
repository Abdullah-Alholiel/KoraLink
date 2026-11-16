# Factory Run #122 — Cycle Docs (ADMIN lane, 122%4=2)

## Gate 0 — Retrospective (compact)

**Ledger check (kanban/DECISIONS.md read first):** no entry governs a dispute-queue triage
surface. The Drawer-RIGHT standard (d0862a7) is untouched — this item adds filters and a
countdown chip inside the EXISTING disputes page layout, no drawer/layout change. No conflict.

**Area audit:** run #121 landed PRs #110/#111/#112 (guard + revenue view + offline strip).
Fix:feat ratio healthy (recent runs mostly feature+verify pairs). Admin area recent commits:
bab418c (earnings revenue view), 60dfc21 (SLA sweep P1-63), 2ec20b9 (reviews), a5cde40 (bulk
moderation) — the disputes module was last touched by the SLA sweep (PR #105). Tech debt
noted: hex DRIFT api_exc_total 254→266, api_raw_sql 55→60 (P2-176 accept-growth, monitored;
new SQL this cycle: list() additions + sweep queries — consistent with the ledger note).

**ADMIN STATE CHECK (Phase 3.5 step-0, run 2026-10-11T10:2xZ):**
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → CLEAN
- Recent admin commits: bab418c, 60dfc21, 2ec20b9, a5cde40, 058574c, 830833c
- `systemctl --user is-active koralink-admin.service` → active
- Routes live under (dashboard): audit, dashboard, disputes, matches, partner, pitches,
  reports, settings, settlements, transactions, users, venues
- → **No ADMIN HOLD.** Item buildable against current state.

**Full-stack connectivity spot-audit (disputes chain):** list() SQL → controller `GET
admin/disputes` → admin page fetches via apiFetch hook → DataTable renders → RecordDrawer
opens findOne. The chain exists end-to-end (run #98/#101 verified appeal lifecycle); this
cycle extends the SAME chain additively (new WHERE clauses + list fields + UI chips/filter).

## Gates 1–3 — Compact program design

**Problem:** disputes show a `sla_escalated` badge but no time dimension — admins can't see
how close an open dispute is to the 7-day SLA breach, can't filter "escalated only" or
"about to breach", and the list has no age-based triage order.

**User story (P1, ops):** as an admin triaging disputes, I see each open dispute's SLA
remaining time (green >3d, amber ≤3d, red breached/escalated), can filter the queue to
escalated rows or rows breaching within 24h, and the queue sorts by SLA urgency first.

**Scope:** IN — ListDisputesDto `sla` filter (`escalated`|`breaching`); list() SQL computes
`sla_deadline`/`sla_hours_left`/`sla_breached` per row (ADDITIVE — existing keys unchanged);
admin disputes page adds countdown chip + urgency filter select + sorts open rows by
hours-left; EN+AR i18n parity; tripwire specs. OUT — sweep logic changes (P1-63 stays),
reminder email surface (P1-41), dispute resolution flows, SLA policy changes.

**Architecture delta:** `apps/api/src/modules/admin/dto/list-disputes.dto.ts` (+sla),
`apps/api/src/modules/admin/disputes.service.ts` (list() clauses + row projection),
`apps/admin/src/app/(dashboard)/disputes/page.tsx` (chip + filter),
`apps/admin/src/messages/{en,ar}.json` (parity), specs both sides. No migration (flag
column exists), no PWA changes, no new endpoints.

**Exact API JSON shape (list row, additive):**
```json
{
  "id": "…", "type": "no_show", "status": "opened",
  "sla_escalated": false,
  "sla_deadline": "2026-10-17T09:30:00.000Z",
  "sla_hours_left": 139.5,
  "sla_breached": false
}
```
Contract rules: deadline = `d.updated_at + interval '7 days'` (sweep keying — the sweep
re-arms on reopen, so updated_at IS the clock start; matches disputes.service.ts SLA_MS);
`sla_hours_left` computed SQL-side as a NUMBER (numeric(10,1) → float8 via ::float8, never
a string — ops sorts/compares client-side); null deadline only for decided rows (frontend
hides chip when null). Existing response keys unchanged → adapter-free additive contract.

**i18n keys (EN+AR, both locales, same count):** `disputes.slaFilterAny/ slaFilterBreaching/
slaFilterEscalated / slaEscalated / slaBreached / slaHoursLeft` (ICU `{h}`), plus `slaLabel`.
Arabic uses Arabic-Indic numerals via existing admin number formatting conventions.

**Gate 3 contract verification checklist:**
- [x] Additive list fields only — existing keys (id/type/status/decision/…/has_appealed) unchanged
- [x] sla_hours_left numeric via ::float8 (never ::text — ops math field, unlike money)
- [x] `escalated` filter maps to the PERSISTED flag (flag+lock idempotency contract, PR #105 r3)
- [x] `breaching` filter = deadline-based predicate using the SAME window constant as the sweep
- [x] i18n keys exist in BOTH en.json and ar.json, leaf counts equal
- [x] No endpoint/response-shape change that could break the 10 jest specs or page tests
- [x] updatedAt null-safety: deadline NULLIF guarded in SQL; frontend hides chip when null

## Gate 4 — slices
1. API: DTO + list() SQL (fields + filters) + jest spec extension → gates
2. Admin: countdown chip + filter select + ordering + i18n EN+AR + structure tripwire → gates
3. Lane branch → PR → bot checks → squash → live E2E (filters + chips via API probe)
