# Run #136 — Program Design (Gates 1–3 compact): P2-207 wallet history queryKey locale

## Problem (Gate 1)

`useWalletHistory` closes over `locale` in its `queryFn` — `adaptTransactionList` renders
clock times per locale ("٧:٣٠ م • Completed" in ar) — but `walletHistoryKey` omits locale
from the React Query key (`useWallet.ts:39-42, 83-96`). After an ar↔en switch, the same
key serves the OLD locale's rendered strings for up to staleTime 60s. The run-#133
"remount makes the closure safe" comment was wrong: remount ≠ cache bust.

Second, unboarded half (found this run): `useFetchAllWalletHistory` (CSV export) calls
`fetchWalletHistoryPage(args)` WITHOUT locale → `adaptTransactionList` defaults to `'en'`.
Arabic users export EN-rendered descriptions in their financial CSV. This is arguably the
worse half (durable artifact vs 60s screen flash).

## Scope

IN: locale in `walletHistoryKey`; locale threaded through `useFetchAllWalletHistory`
(page reads `useLocale()` and passes it; export shares the cache with the screen);
run-#133 stale comment corrected. OUT: wallet API, adapter logic, i18n keys (none needed),
any money-path change.

## User story

As an Arabic user, when I switch the app to Arabic (or export my wallet history), every
transaction description and clock time must render in Arabic — immediately, not 60s
later, and identically on screen and in my CSV.

## Contract (Gate 3)

- `walletHistoryKey({ page, perPage, from, to, locale })` →
  `['wallet', 'history', { page, perPage, from, to, locale }] as const` — key carries the
  FULL render-affecting param set (P2-15 rule generalized: every closure variable that
  affects the cached VALUE belongs in the key).
- `useWalletHistory` passes `locale` from `useLocale()` into both key and queryFn —
  locale flip → new key → fresh fetch. No stale window.
- `useFetchAllWalletHistory(): (range, opts?: { locale?: 'ar'|'en' }) => Promise<...>` —
  locale now REQUIRED to flow; the hook reads `useLocale()` as the default so the
  wallet page gets AR exports for free; optional explicit override keeps the function
  usable from non-hook contexts. All pages share the locale-carrying key.
- Export → screen cache coherence: screen (`page=1..n`, perPage 20) and export
  (perPage 100) use different keys by design (different filters); the invariant is
  only that EQUAL args + EQUAL locale share one cache entry.
- `useTopupWallet`'s `invalidateQueries({ queryKey: ['wallet','history'] })` is a PREFIX
  invalidate — still hits all locale variants. No change.
- i18n: no new keys (zero user-facing copy added).

## Contract verification checklist

- [x] Every changed function's TS signature explicit (above).
- [x] Frontend types accept the exact shape produced (WalletHistoryPage unchanged).
- [x] No field silently undefined (locale now flows everywhere it is consumed).
- [x] i18n keys: none added; existing EN/AR untouched (parity stays 1095/1095).
- [x] Adapter contracts unchanged — same `adaptTransactionList(rows, locale)`.

## Gate 4 slices

1. Tracer: `walletHistoryKey` carries locale + `useWalletHistory` threads it + test
   proving an ar-locale mount uses a different key than en (no 60s stale window).
2. Export half: `useFetchAllWalletHistory` locale default + param; page passes nothing
   (hook reads locale); test pins AR export fetches carry locale ar.
3. Correct the run-#133 comment (remount ≠ cache bust) so the false rationale doesn't
   survive in code.

## Verification plan

- `cd apps/player-pwa && npx vitest run` → grep 'Test Files … passed'.
- `npm run type-check` (tsc includes test/).
- Root: `npx turbo run build --concurrency=1` 3/3 (sequential — 4 GiB scope).
- Root lint `npm run lint` must be verified green BEFORE claiming (run #132 residue class).
