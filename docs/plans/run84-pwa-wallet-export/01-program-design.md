# Run #84 — Gates 1–3 compact (P2-119 wallet export + purge-fix batch)

## Gate 1 — Product spec (P2-119)
- **Problem:** players reconciling group payments have no artifact to prove payment offline to a
  host/venue; no way to narrow history to a date range (Reviewer B P1, run #82).
- **User story:** as a player, I open Wallet → Export, optionally pick From/To, tap Export CSV,
  and get a spreadsheet file of my transactions.
- **Success criteria:** CSV downloads with correct escaping; range filters server-side; empty
  range → localized info toast; failure → localized what-happened/what-next toast; EN=AR parity.
- **Out of scope:** PDF export, balanceAfter column (no snapshot column exists), status column
  (dummy-wallet era has no Pending rows), Hijri display (nice-to-have, not blocking).

## Gate 2 — Architecture
- API: extend WalletHistoryDto (`from`/`to`, IsISO8601, optional) + getHistory additive predicate.
- PWA: wallet page Export action → BottomSheet (date inputs) → `useFetchAllWalletHistory`
  (paged fetchQuery loop, cap 20 pages) → `buildWalletCsv` (pure, lib/wallet-csv.ts) →
  `downloadTextAsFile` (refactored from downloadJsonAsFile).
- Files: wallet-history.dto.ts, wallet.controller.ts, wallet.service.ts(+spec),
  wallet/page.tsx, useWallet.ts, lib/wallet-csv.ts (new), lib/download.ts,
  messages/en+ar.json, test/app/wallet-export.test.tsx (new).
- Purge-fix batch (PR #47): sw-cache-hygiene.ts (+matches-feed-cache, +getLastRuntimeCachePurge),
  fetcher.ts (await before 401 redirect), profile page (await ×2 + purgeDate effect),
  DeleteAccountSheet.tsx (optional prop + guarded warning), 2 test files.

## Gate 3 — Contracts (verified against implementation)
- API JSON: `{ transactions: TransactionApi[], total: number, hasMore: boolean }` unchanged;
  new optional query params only — no breaking shape change.
- TS: `getHistory(userId, page?, perPage?, from?, to?)`; `useWalletHistory(params?: {page?,
  perPage?, from?, to?})` — queryKey carries ALL filters (P2-15 rule).
- Adapter: `adaptTransactionList` reused unchanged (extend-backend/reuse-adapter pattern).
- i18n contract: wallet.export/exportTitle/exportFrom/exportTo/exportCsv/exportEmpty/
  exportSuccess/exportInvalidRange + errors.exportFailed/exportFailedDetail — EN+AR present,
  leaf parity equal (1002/1002).
- Checklist: [✓] additive predicate (user_id never replaced — spec-pinned) · [✓] inverted range
  rejected server AND client · [✓] no `::uuid`, parameterized dates via drizzle gte/lte (Date
  objects, not interpolated strings) · [✓] CSV escaping RFC 4180 (tested) · [✓] i18n parity.
