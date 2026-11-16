# Run #92 — Gates 1-3: P2-132 Live refresh for feed + conversations + discussions

## Gate 1 — Product Spec (compact)

**Problem:** A player sitting on the Play feed sees a match stay "Open" after it fills/cancels; on the Messages screen, unread badges and thread order don't move while DMs arrive. Data only refreshes on navigation, pull-to-refresh, or error retry.

**User stories:**
- P0: As a player on the Messages screen, I see unread counts and thread order update live-ish (≤45s) without leaving the screen.
- P0: As a player on the Play feed, roster/status changes appear within ~45s while I sit on the screen.
- P1: As a player with no network, the feed tells me I'm offline (same banner pattern as messages + match detail) instead of a generic error banner.

**Scope:** IN — 3 PWA surfaces (feed, conversations list, discussions list) get a page-1 refetchInterval; play feed gets `useOnlineStatus`-gated offline banner; tests for all touched hooks/pages. OUT — server broadcast changes (no global feed event exists; adding one is a backend contract change), thread-view behavior (already live), match detail (already live), admin surfaces.

**Success criteria:** vitest suites for useMatches/useConversations/useMessages cover the poll semantics (windowed on pages, disabled while hidden/paged-deep); i18n parity stays 1007/1007; turbo build 3/3; PR green; no behavior change to thread view or match detail.

## Gate 2 — Architecture (compact)

Data flow (unchanged contracts): same 3 REST endpoints (`/matches`, `/conversations`, `/users/me/discussions`), same adapters; only React Query scheduling changes. No API/DTO/schema/migration changes. Files changed:

| File | Change |
|---|---|
| `apps/player-pwa/src/hooks/useMatches.ts` | feed infinite query: `refetchInterval` = page-1-windowed 45s (new helper `page1RefetchInterval`) |
| `apps/player-pwa/src/hooks/useConversations.ts` | same on `['conversations','infinite']` |
| `apps/player-pwa/src/hooks/useMessages.ts` | same on `['user','me','discussions']` |
| `apps/player-pwa/src/lib/query-schedule.ts` (NEW) | shared helper: 45_000 when `pageParam===0 && !isFetching && document.visibilityState==='visible'`, else `false` |
| `apps/player-pwa/src/app/[locale]/(main)/play/page.tsx` | `useOnlineStatus()`; `OfflineBanner isOffline={!isOnline && !isLoading}` variant plain |
| tests: `test/lib/query-schedule.test.ts` (NEW), `test/hooks/useMatches.test.tsx` (extend), `test/hooks/useConversations-list.test.tsx` (NEW), `test/hooks/useDiscussions.test.tsx` (NEW), `test/components/play-offline.test.tsx` (NEW) | poll semantics + offline gating |

i18n: **no new keys** (offline banner uses existing `offline.*` namespace already rendered by OfflineBanner).

## Gate 3 — Program Design (contracts)

**Shared helper (single source of poll policy):**
```ts
// apps/player-pwa/src/lib/query-schedule.ts
export const LIST_REFRESH_MS = 45_000;
export function listRefetchInterval(ctx: {
  isFetching: boolean;
  pageParam: unknown;      // pass query.state.fetchNextPageParam ?? first page's pageParam
  hasMore?: boolean;       // optional: extra guard, kept simple via pageParam
}): number | false {
  if (ctx.isFetching) return false;                 // never stack polls behind an in-flight fetch
  if (ctx.pageParam !== 0 && ctx.pageParam !== 1) return false; // paged deep — stop polling (F4 fan-out guard)
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return LIST_REFRESH_MS;
}
```
Wire shape (v5 signature — `refetchInterval` receives `({ queryKey, state })`):
```ts
refetchInterval: ({ state }) => listRefetchInterval({
  isFetching: state.isFetchNextPageError === true ? true : state.status === 'pending' ? false : queryClientCacheProbe(state),
  pageParam: state.fetchNextPageParam ?? 0,
}),
```
**Corrected wiring used in build (simpler + provably typed):**
```ts
refetchInterval: ({ state }) =>
  listRefetchInterval({
    isFetching: state.isFetching,
    pageParam: state.fetchNextPageParam ?? 0,
  }),
```
(`state.fetchNextPageParam` is the pageParam the NEXT fetch would use; when the user has paged deeper it is >0 → poll disabled. On a fresh list it is `0`/`1` per list's `getNextPageParam` output. React Query refetches ALL pages on interval — hence the page-1-only guard, per the F4 comment at `useMatches.ts:179-181`.)

**Visibility:** React Query v5's `refetchInterval` + `refetchIntervalInBackground:false` (default) already stops interval refetches while hidden; the `document.visibilityState` check inside the helper is a second belt (tab just became visible mid-window).

**Consumers (unchanged):** all three hooks keep their existing return shapes (`{ matches, total, hasMore, fetchNextPage, refetch, isLoading, error, ... }`) — zero component churn except play/page.tsx banner line.

**Play offline banner contract:** `const isOnline = useOnlineStatus();` → `{error && !isLoading && <OfflineBanner isOffline={!isOnline} variant="plain" className="mx-4 mb-3" />}` — i.e. offline → offline banner; online + fetch error → **no banner change from status quo** (error branch keeps rendering OfflineBanner plain as today; dedupe of error UX is P2-class, out of this slice).

Wait — that keeps the mislabeled error state. Corrected contract (final):
```tsx
{error && !isLoading && !isOnline && (
  <OfflineBanner isOffline variant="plain" className="mx-4 mb-3" />
)}
```
When online and a real fetch error occurs, feed must render the standard error state (retry button + localized message, same as messages/page.tsx error block) — replacing the misleading "offline" banner. This is the Reviewer B finding, fixed properly.

## Gate 3 contract verification checklist

- [x] Every mutation endpoint returns populated object — N/A (no mutations, no API change).
- [x] Frontend types accept backend JSON — unchanged queryFn/adapters; no shape drift.
- [x] Adapter functions exist for every consumed shape — unchanged (`adaptMatchList`, `mapSummary`, `adaptDiscussionList`).
- [x] No field silently undefined — helper reads only `state.isFetching` / `state.fetchNextPageParam` (v5 InfiniteQueryState fields, verified in @tanstack/react-query ^5.56.2).
- [x] i18n keys exist for every user-facing string both languages — no new keys; `offline.*` already in en/ar (1007/1007 parity pre-change; re-checked post-build).
- [x] Poll semantics pinned by tests: page-1-only, disabled while fetching, disabled when paged deep, visibility guard.
