# 03 — Program Design — Admin Table Restructure

## The triage rule (from the reel)
Rank columns by use: **identity → value → state**. Exactly three survive in the mobile row:
1. **Identity** — the strongest human name (user, venue, match title). Line 1, left.
2. **Value** — the money (falls back to the operational count when a list has none). Line 1,
   right, `tabular-nums`, ONE slot for the whole list.
3. **State** — badge + the ONE date that matters, **labeled** ("Joined 4 Mar", bare "4 Mar" dies).
Everything else (IDs, phones, notes, secondary counts, actions) → **RecordDrawer** on tap.
No header row on cards. The ID leaves first, always.

## Per-table triage (12 tables)

| Page | Identity (L1) | Value (R1, tabular) | State line (labeled) | → Drawer |
|---|---|---|---|---|
| admin/transactions | user name + phone | ±amount | Status badge · Paid-out date | ID, type, reference, refund action |
| admin/users | name + @handle | wallet | Status badge · Joined date | ID, phone, role, karma, no-shows, purge, ban/suspend actions |
| admin/venues | name + address | pitch count | Verification badge · Approval badge | owner, city, approve/reject/transfer/edit actions |
| admin/matches | title + venue·pitch | price/player | Status badge · Kick-off date | ID, host, spots x/y, edit/cancel actions |
| admin/settlements | venue name | amount | Status badge · Period date range | ID, payout ref, created, pay action |
| admin/audit | admin name | action chip | Entity type · Time (labeled) | entity ID, IP |
| admin/disputes | match title | — | Status badge · Opened date | ID, type, reporter → respondent, Review action |
| admin/reports | subject label | — | Status badge · Reported date | ID, subject type, reporter, full reason, Review action |
| admin/pitches | pitch + venue·city | hourly rate | Status badge · Slots x/y | owner + phone, size, schedule/toggle/edit actions |
| partner (schedule) | pitch + match | — | Booked badge · Start–End times | — (dense widget; cards only) |
| partner/matches | match title | players x/y | Status badge · Kick-off date | venue·pitch, no-shows, link to detail |
| partner/matches/[id] roster | player name | — | No-show + Host chips · phone | — (phone labeled on card) |
| partner/earnings | venue name | amount | Status badge · Period range | ID, payout ref, created |

(Disputes/reports/audit/roster have no money: value slot carries the state badge or count
instead — one slot per row is preserved; label anything ambiguous.)

## Component contracts

```ts
// components/DataTable.tsx
export interface ColumnDef<T> {
  key: string;
  header: string;                     // desktop table header (i18n string)
  align?: 'start' | 'end';
  tabular?: boolean;                  // tabular-nums
  secondary?: (row: T) => ReactNode;  // desktop sub-line under the cell
  role: 'identity' | 'value' | 'meta' | 'detail'; // card placement
  cardLabel?: string;                 // label for ambiguous card values
  render: (row: T) => ReactNode;
}
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;      // opens RecordDrawer
  empty?: ReactNode;                  // passed through to both renders
}
```
- Breakpoint: native CSS container query in `globals.css` (`.dt-root` container; <700px hides
  `<table>`, shows card list). NO new npm dependency; container queries are baseline 2023.
- Cards show max: identity, value, TWO meta fields (labeled) — mirroring the reel's two-line row.
  Actions NEVER render on cards (thumb trap); they live in the drawer.

```ts
// components/RecordDrawer.tsx — builds on existing Drawer (right-anchored, unchanged)
interface RecordDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  recordId?: string;                  // rendered as labeled mono ID row (the reel: hidden ≠ deleted)
  fields: { label: string; value: ReactNode }[];
  actions?: ReactNode;                // same handlers as before (refund, ban, pay, …)
  footerLink?: { href: string; label: string }; // "Open full page" where a detail route exists
}
```

```ts
// components/SortSelect.tsx
interface SortSelectProps {
  value: string;                      // "" = default
  options: { value: string; label: string }[];
  onChange: (v: string) => void;      // writes sortBy (+dir when needed) into the page qs
}
```

## API contract (additive, non-breaking)
`GET …?sortBy=<key>&dir=<asc|desc>` on five endpoints. Whitelist map per service — unknown or
missing `sortBy` → existing default ORDER BY (silent fallback, never a 500):

| Endpoint | Whitelist | Default |
|---|---|---|
| /admin/transactions | `created_at`, `amount` | created_at DESC |
| /admin/users | `created_at`, `wallet_balance`, `full_name` | created_at DESC |
| /admin/matches | `scheduled_at`, `price_per_player` | scheduled_at DESC |
| /admin/settlements | `created_at`, `amount` | created_at DESC |
| /partner/matches | `scheduled_at` | scheduled_at DESC |

Response shapes unchanged. Drizzle: `orderBy(dir === 'asc' ? asc(col) : desc(col))` /
raw-SQL services interpolate ONLY from the whitelist map (no user string reaches SQL).

## i18n contract
New `list` namespace (en/ar, parity-gated): `sortLabel`, `sortNewest`, `sortOldest`,
`sortAmountHigh`, `sortAmountLow`, `sortNameAZ`, `details`, `idLabel`, `openPage`.
All card labels reuse existing `th*`/status keys.

## Observability contract
- `admin_record_open { page, entityId }` and `admin_list_sort { page, sortBy }` via
  ObservabilityProvider's posthog client.
- Services `this.logger.debug({ sortBy, dir }, 'list sorted')` on the five endpoints.
