# Run #116 — P2-107 admin bulk moderation — Gate 0 + Gates 1-3 (compact)

## ADMIN STATE CHECK (Phase 3.5 step 0 — 11:06Z)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin` → clean (no in-flight Abdullah edits).
- `git log --oneline -8 -- apps/admin` → last owner-area commit 058574c (P2-166, merged run #114); nothing new since the row was written.
- `koralink-admin.service` active; routes unchanged (users page exists at
  `apps/admin/src/app/(dashboard)/users/page.tsx`, 403 lines).
→ NO HOLD. Item scope matches live code.

## Gate 0 retro (area audit)
Existing single-row moderation is HEAVILY guarded (`users.service.ts update()` :168-381):
PDPL ghost guard (deleted → 409), self-moderation guards, last-admin FOR UPDATE lock tx
(P2-116/PR-Agent run #79 fix), audit entry riding the write tx, ops broadcast, socket
force-disconnect (P1-50/P2-77), player notification activity. The `banSubject` path
(reports.resolve) already reuses it via `inTx` (P2-141).

**Design consequence:** the bulk path MUST NOT re-implement moderation — it loops the SAME
`update()` per id so every guard applies per row, then writes ONE batch audit entry
(`admin_bulk_ban` / `admin_bulk_suspend` with the id array) per the vetoed default.

**Prior reviewer signal:** P2-51/PR #100 precedent — PR-Agent caught a real SQL bug on PR
#101 this run (GROUP BY u2.id) → the PR-flow review layer works; keep changes reviewable
in small diffs.

## Gate 1 — Product (compact)
**Problem:** HQ users list bans/suspends one-at-a-time; an incident with N abusive accounts
needs N confirm-clicks. Ops pain at scale (Reviewer B run #74).
**User story:** as an ops admin I select multiple users on the users list (checkbox column
+ select-all-on-page), click one "Ban selected"/"Suspend selected" action, see a
confirmation dialog naming the count, and one audit-log entry records the batch.
**Scope IN:** checkbox column (users page only), select-all-on-page, bulk-ban +
bulk-suspend (7-day default, same as the single-row action), confirm dialog, batch audit
entries, ≤50/batch cap, purge/restore/delete NEVER bulk.
**Scope OUT:** no bulk unban/lift (rare op), no cross-page selection, no bulk role change,
no bulk delete (PDPL irreversible — explicitly excluded by the default).

## Gate 2 — Architecture (compact)
| File | Change |
|---|---|
| apps/api/src/modules/admin/users.controller.ts | +`POST bulk` endpoint (new DTO, @HttpCode 200) |
| apps/api/src/modules/admin/dto/bulk-moderate.dto.ts | NEW: ids[] (Array of uuid, 1..50) + action enum('ban','suspend') |
| apps/api/src/modules/admin/users.service.ts | +`bulkModerate()` — validate ids exist, loop this.update() per id, one audit entry |
| apps/admin/src/components/DataTable.tsx | +optional `selection` props (additive, all other pages untouched) |
| apps/admin/src/app/(dashboard)/users/page.tsx | selection state, bulk action bar, ConfirmDialog wiring |
| apps/admin/src/messages/{en,ar}.json | +~10 hq.* keys |
| apps/api/src/modules/admin/users.bulk-moderate.spec.ts | NEW spec |

## Gate 3 — Exact contracts

### API
`POST /api/v1/admin/users/bulk` (AdminAuthGuard; adminId from JWT; ip passthrough)
Request: `{ "action": "ban" | "suspend", "ids": ["<uuid36>", ...] }` (1..50, unique).
Response 200 (PARTIAL-SUCCESS contract — per-row guards can reject individual rows):
```json
{
  "action": "ban",
  "requested": 3,
  "updated": 2,
  "skipped": [
    { "id": "…", "reason": "Self-moderation guard" },
    { "id": "…", "reason": "Last-admin guard" }
  ]
}
```
- Per-row failure reasons = the exception `message` from `update()` (last-admin guard,
  self-ban, PDPL ghost 409). Loop continues on failure (per-row isolation); 404 = row
  vanished → skip reason `Not found`.
- Self-inclusion: the WHOLE batch 400s if it includes the caller's own id (bulk scope is
  other accounts; mirrors the single-row guard intent).
- Audit: ONE entry per batch per action type — `admin_bulk_ban` / `admin_bulk_suspend`,
  entity_type 'user', entity_id NULL, after = { ids, updated, skipped } (json).
- Socket disconnects + per-player notification activities ride the existing per-row
  `update()` side effects unchanged.

### TS signatures
```ts
// dto/bulk-moderate.dto.ts
export class BulkModerateUsersDto {
  action!: 'ban' | 'suspend';
  ids!: string[]; // 1..50 unique uuids
}
// users.service.ts
async bulkModerate(
  dto: BulkModerateUsersDto,
  adminId: string,
  ip?: string,
): Promise<{ action: 'ban' | 'suspend'; requested: number; updated: number;
             skipped: Array<{ id: string; reason: string }> }>
```

### DataTable (additive props — zero impact on 7 existing consumers)
```ts
selection?: {
  selectedIds: ReadonlySet<string>;
  isRowSelectable: (row: T) => boolean;
  onToggle: (row: T) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  selectAllLabel: string;
};
```
Renders a leading checkbox column (header = select-all checkbox, indeterminate via ref)
on BOTH desktop table + card layouts; checkbox click stopPropagation (row click opens
the drawer). No selection props → byte-identical render for every other page.

### i18n keys (hq ns; EN+AR atomic)
bulkBan, bulkSuspend, bulkSelectedCount ({count}), bulkConfirmBanTitle,
bulkConfirmSuspendTitle, bulkConfirmBanBody ({count}), bulkConfirmSuspendBody ({count}),
bulkResult ({updated}/{requested}), bulkCapNote (50), bulkActionFailed.

## Gate 3 checklist (explicit)
- [✓] No existing endpoint signature changes (new POST only; single-row PATCH untouched).
- [✓] No migration (audit_logs/ids reuse existing columns; no schema change).
- [✓] Frontend types: AdminUser already on disk; new response type local to page.
- [✓] i18n EN+AR parity enforced by leaf-count check in the slice.
- [✓] Money untouched. PDPL: bulk paths exclude purge/delete by design; ghost guard runs
      per-row anyway.
- [✓] Last-admin lock preserved per-row (loops the guarded update()).
