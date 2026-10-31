# Run #82 — Program Design (Gates 1–3 compact): P2-115

## Problem (user story)
As an HQ admin, when I save a platform setting, the API must reject typos/invalid values instead of silently creating dead keys, and every change must appear in the audit log with before/after so pricing/policy history is reconstructable.

## Scope
IN: server-side key allowlist + typed bounds validation; audit trail on settings.update; controller passes adminId/ip; audit-page entity+action filters (fold-in from the board row); i18n for new filter label.
OUT: settings UI rewrite (page already fine); adminId UUID picker (no admin-list surface — API param supported, UI descope documented); per-key secrets (not in app_settings).

## Architecture delta
- `AdminSettingsService`: adds `KNOWN_SETTINGS` registry (exported const) + `assertKnownKey`/`validateValue` privates; `set(key, value, adminId, ip)` — old-value read + upsert in ONE tx under `.for('update')`; `audit.log` AFTER commit (house pattern, disputes.service.ts:137); keeps `platformSettings.invalidate()` + `realtime.broadcastOps('settings')`.
- `AdminSettingsController.set`: extracts `adminId = (req as {user:{sub}}).user.sub`, passes `req.ip`.
- `AuditController.list` + `ListAuditDto`: optional `action` param → parameterized ILIKE alongside adminId/entityType.
- Admin audit page: entity-type select (10 discrete types incl. `setting`) + action substring input; both reset pagination; labels via `common.filterByType` / `common.filterByAction`.

## Exact contracts
- `PUT /admin/settings/:key` 200 → `{ "key": "platform_margin_sar", "value": 7 }` (value = validated number|string); unknown key → 400 `Unknown setting "<key>". Valid keys: platform_margin_sar, grace_period_mins, payout_cadence_days, refund_policy`; bad value → 400 with key name + bounds.
- Registry: `platform_margin_sar {number 0..1000}` · `grace_period_mins {number 0..1440}` · `payout_cadence_days {number 1..90}` · `refund_policy {text ≤10000}`.
- `GET /admin/audit-logs?action=settings` → same `{logs, total, page, perPage}` shape, action ILIKE %term%.
- AuditEntry: `{adminId, action:'settings.update', entityType:'setting', entityId:key, before:oldValue|null, after:newValue, ip}`.
- i18n: `common.filterByAction` = "Filter by action" / "تصفية حسب الإجراء" (EN+AR parity preserved).

## Gate 3 contract verification checklist
- [x] Mutation returns fully populated shape (`{key, value}` — settings rows have no relations; getAll returns `{settings: Record<key, value>}` unchanged).
- [x] Admin UI types accept the exact JSON (SettingsResponse unchanged; page reads `data.logs/total` as before).
- [x] Adapter/hook surface unchanged (page calls `api.put` directly; no new adapter needed).
- [x] No silently-undefined field (validated value always returned; before defaults null in AuditService).
- [x] i18n keys exist in BOTH locales (`common.filterByAction` inserted at matching position after `filterByType`).

## Slices (Gate 4)
1. API validation + audit (lane `01a0e5a6` built → PR #44 commit `f7d19b7`).
2. Audit-page filters API+UI+i18n (parent-built → PR #44 commit `ee9e272`).
3. PR-Agent fix: `setting` in filter options (`c498541`).

## Risks & mitigations
- Allowlist could lock out future keys → registry is a single exported const; adding a key = one registry entry + UI entry (documented in code comment).
- First-write `before=null` audit edge (FOR UPDATE locks no row) → accepted: first write has no prior value by definition; concurrent-first-write race documented as follow-up.
