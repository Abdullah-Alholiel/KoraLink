# 04 — Slices — Admin Table Restructure

## Slice 1 — Component family (tracer bullet)
- `globals.css`: `.dt-root` container (`container-type: inline-size`), `.dt-table`/`.dt-cards`
  swapped by `@container (max-width: 699.98px)` — the breakpoint belongs to the TABLE.
- `components/DataTable.tsx` — `ColumnDef<T>` with roles `identity | value | meta | detail`;
  desktop = classic table, cards = identity left + value top-right (`tabular-nums`) + labeled
  meta line. Empty state renders as a single chrome-free shell in both branches.
- `components/RecordDrawer.tsx` — labeled mono ID + full field list + row actions + optional
  "open full page" link (built on the shared right-anchored Drawer, untouched).
- `components/SortSelect.tsx` — the sort control (i18n `list.sortLabel`).

## Slice 2 — i18n
- New `list` namespace (10 keys en+ar). Fixed pre-existing hardcoded strings while converting:
  `hq.liftAction`, `hq.suspendAction` (users), `hq.payAction`, `hq.generatePayouts`
  (settlements), `hq.thSubjectType` (reports). Parity: 544 = 544 (script-verified).

## Slice 3 — HQ pages (9 tables)
transactions · users · venues · matches · settlements · audit · disputes · reports · pitches.
Every page: overflow-x-auto table → DataTable + RecordDrawer; actions moved into the drawer
(same API calls); dates labeled (`cardLabel`); IDs only in the drawer; amounts one slot,
top-right, tabular figures. `trackEvent('admin_record_open' | 'admin_list_sort')` wired.

## Slice 4 — Partner pages (3 tables + roster)
dashboard schedule (slot time-range as value) · matches list (players x/y as value, row →
detail via `useRouter`) · match roster (host/no-show chips, labeled phone) · earnings
(settlement table; local `PartnerSettlement` row type).

## Slice 5 — Server-side sort (5 endpoints)
- `apps/api/src/common/utils/sort.ts` — `whitelistedOrderBy()`: sortBy is a KEY lookup only;
  unknown/missing → endpoint default ORDER BY (silent, never 400/500); dir ∈ asc|desc.
- DTOs: `sortBy`/`dir` via `@IsIn` whitelists — transactions(created_at|amount),
  users(created_at|wallet_balance|full_name), matches(scheduled_at|price_per_player),
  settlements(created_at|amount), partner matches(scheduled_at).
- Services: raw-SQL list interpolate `${orderBy}` from the whitelist map; users + partner
  matches use drizzle `asc()/desc()` branches. Controller threads the params through.

## Verification
- [x] `tsc --noEmit` green: apps/admin + apps/api (real runs, exit 0)
- [x] i18n parity 544=544 (script)
- [x] `npm run build` (turbo, all apps) — result recorded below
- [ ] Postgres round-trip of `sortBy` (requires API restart — owner call, services untouched)
