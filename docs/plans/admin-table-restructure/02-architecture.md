# 02 — Architecture — Admin Table Restructure

## Component family (apps/admin/src/components/)

```
DataTable        container-query shell: renders <table> ≥700px, <div role="list"> of
                 DataCards below 700px. No horizontal scroll path exists.
  ├─ columns:    ColumnDef[] — { key, header, align, tabular?, render(ctx), card? }
  ├─ DataCard    the restructured row (grid: identity | value; meta line; detail line)
  └─ RecordDrawer right-anchored (existing Drawer) — ID, full field list, row actions.
SortSelect       control in the filter bar; writes ?sortBy= + ?dir= into the query string;
                 useLiveAdminData refetches on path change (already does — reload([path])).
```

## Data flow (unchanged contract, additive only)
- All list pages keep `useLiveAdminData(path)`; the path now may carry `sortBy`/`dir`.
- API: each of the 5 sorted lists gains an optional `sortBy` query param validated against a
  per-endpoint whitelist map `{ field: sql }`; invalid values fall back to the existing default
  ORDER BY (never a 500 — unknown sortBy → default). `dir` ∈ `asc|desc`, default = endpoint's
  current direction.
- New lists for mobile cards need NO new endpoints: RecordDrawer reuses row data already
  shipped in the list response (ID + fields are on the row object; we just stopped showing
  some of them in the ≥700px table).

## Breakpoint rule (move 6)
`@container` (Tailwind 3.4 core: `@container` class + `@[@700px]:` variants) lives on the
DataTable wrapper — NOT on a viewport media query. The same table dropped into a desktop
side panel narrower than 700px restructures to cards automatically.

## i18n
New namespace `list` (shared): `sort.label`, `sort.newest`, `sort.oldest`, `sort.amountHigh`,
`sort.amountLow`, `sort.nameAZ`, `details`, `id`, `card.unlabeled`. Per-page labels reuse the
existing `hq`/`partner` `th*` keys — no key duplication. Parity gate script must stay green.

## Observability (mandated for new features)
- RecordDrawer open fires `posthog.capture('admin_record_open', { page, entity_id })` via the
  existing ObservabilityProvider.
- Sort use fires `admin_list_sort` (page, sort key) — tells us which sort ops actually wants.
- Pino: server logs `sort=field dir=dir` at debug on the 5 whitelisted endpoints (request-scoped
  logger already available).
