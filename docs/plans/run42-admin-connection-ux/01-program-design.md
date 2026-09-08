# Run #42 — Program Design: admin connection-state UX

## Problem
Admin/partner console surfaces fail opaquely: raw backend error strings render verbatim
(no what-happened/why/next guidance, 500 internals leak), there is no offline indicator
anywhere in apps/admin, and dashboard metrics format numbers without a pinned locale.

## User story
As an admin on a flaky connection, I see an honest banner when offline, a standardized
error card (what happened + why + Try again) when a load fails, and stable number
formatting — in EN and AR.

## Scope
IN: `LoadError` component; `useOnline` hook; global OfflineBanner in (dashboard) layout;
LoadError wired into all 22 useLiveAdminData consumers; dashboard toLocaleString pin;
EN+AR i18n keys. OUT: a11y aria/hit-target batch (boarded P2-54), live/stale indicator,
admin test infra, API changes, PWA.

## Contracts (Gate 3)
1. `useOnline(): boolean` — SSR-safe (initial true, syncs on online/offline events in
   useEffect). No SSR/client hydration mismatch.
2. `LoadError({ error, onRetry?, className? })` — renders null when `!error`; otherwise:
   title `common.loadErrorTitle` (bold), detail = raw message in a muted `dir="ltr"`
   break-words line (ops value: the backend reason is preserved, de-emphasized, never
   the headline), hint `common.loadErrorHint`, button `common.retry` → onRetry.
   role="status". All copy from common ns → pages need NO new per-namespace keys.
3. OfflineBanner mirrors PWA precedent (amber strip, WifiOff, role="status"), mounted ONCE
   in (dashboard)/layout.tsx above {children} — covers HQ + partner routes globally.
4. `formatMetricInt(n: number): string` in lib/utils.ts — `toLocaleString('en-US')`
   pinned (console convention: Latin digits; determinism fix). Dashboard 3 call sites.
5. i18n keys added to apps/admin/src/messages/{en,ar}.json common:
   loadErrorTitle / loadErrorHint / offlineBanner (retry exists). Parity checked via jq.

## Files changed
- new: src/components/LoadError.tsx, src/components/OfflineBanner.tsx, src/lib/use-online.ts
- edit: src/lib/utils.ts, src/app/(dashboard)/layout.tsx, dashboard/page.tsx,
  21 consumer pages (mechanical error-block swap), messages/en.json, messages/ar.json

## Verification checklist (Gate 3)
- [x] No API/backend surface touched → no mutation-return contract exposure
- [x] i18n parity: en/ar leaf keys equal after edit (jq diff)
- [x] SSR safety: no hook reads navigator during render except client-guarded
- [x] No page loses its retry path (pages without reload destructured get it added)
- [x] Zero remaining raw `{error}` headline renders (grep-verified)
- Gates: root turbo build 3/3 + admin tsc --noEmit + eslint clean
