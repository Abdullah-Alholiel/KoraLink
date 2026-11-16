# Run #179 — Program Design (Gates 1-3 compact)

## Item 1 — P2-287: top-up pending card self-resolves (PWA, user-visible)

**Problem:** a player whose 3DS callback died sees the amber "last attempt pending" card stale
forever — `useLatestTopupIntent` fetches once (`retry:false`, no polling). Reviewer B run-#178 P2.

**User story:** as a player with an unconfirmed top-up attempt, I see the card clear by itself
when my bank confirms/abandons the payment, without reloading the app.

**Scope:** hook-only change + tests. No API change (endpoint exists), no schema, no i18n.
OUT: any 'failed' status writer (backend row P2-279 note stands); push notifications.

**Contract (unchanged):** `GET /wallet/topup/latest` → `{intent: null | {id, amountSar, status:'pending'|'credited', createdAt}}`.

**Design:** conditional polling in React Query v5:
- `refetchInterval: (query) => query.state.data?.intent?.status === 'pending' ? 10_000 : false`
- `refetchIntervalInBackground: true` (3DS confirmations arrive while the tab is hidden)
- `refetchOnWindowFocus: true` (a tab return is the cheapest freshness kick — overrides the
  global default false for this query only; harmless when data is credited)

**Files:** `apps/player-pwa/src/hooks/useTopup.ts` (hook only) + `test/hooks/useLatestTopupIntent.test.tsx` (extend).

**Tests:** pending → interval fires and refetches; credited → polling stops; card copy untouched.

## Item 2 — P2-286: settlements CSV export carries paid-date + paid-by (Admin)

**Problem:** export columns venue/amount/status/period/payoutRef/id only; finance reconciliation
needs when + who paid. Reviewer B run-#178 P2.

**Scope:** CSV columns + translations only. `paid_at`/`requested_by_name` ALREADY reach the
admin (types.ts:184/189; list SELECT carries both since P2-160) — render-only change.
OUT: table column additions (drawer already shows provenance; DataTable identity columns are
governed by the 2026-09-07 standard — do not widen the table), server changes, sort keys.

**Contract:** new CSV columns appended (no reordering of existing ones):
- `paidAt` → header `t('thPaidAt')`, value `csvDate(s.paid_at)` (existing helper; '' when null)
- `paidBy` → header `t('thPaidBy')`, value `s.requested_by_name ?? ''` — mirrors the drawer rule
  (P2-160: null full_name falls back to short id, never 'Auto-generated' misread).

**Files:** `apps/admin/src/app/(dashboard)/settlements/page.tsx` (export `build.columns` only) +
admin i18n en.json/ar.json (`hq.thPaidAt`, `hq.thPaidBy` ×2 locales).

**i18n keys:** en `Paid at` / `Paid by`; ar `الدُفع في` / `الدُفع بواسطة` — parity must stay equal.

## Gate 3 checklist (both items)
- [x] No new endpoints; existing shapes consumed as-is (checklist item 1 n/a)
- [x] Admin type `Settlement` already declares `paid_at` + `requested_by_name` — no field the
      backend fails to return (verified settlements.service.ts:61 SELECT)
- [x] Adapter functions: none needed (direct field consumption)
- [x] No field silently undefined: `paid_at` null → csvDate('') branch; `requested_by_name`
      null → short-id fallback branch — both handled
- [x] i18n keys exist in BOTH locales before build (P2-286); P2-287 adds no keys
- [x] Mutation-return rule n/a (no mutations touched)
- [x] Money untouched: display-only CSV columns; no re-derivation of any amount

## Lane decision (mandatory line)
Lane: USED — route P2-287 (item 1) through zeroshot (preconditions: pro loggedIn ✓,
zeroshot 10.7.0 ✓, slice-sized ✓, PWA not admin-dirty ✓, no live-DB dep ✓). P2-286 stays
parent-built on a lane branch per the PR flow.
