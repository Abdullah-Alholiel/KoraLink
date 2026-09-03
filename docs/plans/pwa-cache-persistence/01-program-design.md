# Gates 1-3 (compact) — PWA Persisted Query Cache

## Gate 1 — Product Spec

**Problem:** kill + reopen of the installed PWA shows a blank shell + spinners while every
screen refetches from the network. On Gulf mobile networks that's 1-3s+ of dead time on every
cold open, even though the same data was on screen moments earlier.

**User story:** As a player, when I reopen KoraLink I want to see my last feed/games/clubs
immediately, with fresh data quietly replacing it — not a spinner wall.

**Scope:**
- IN: persist React Query cache → IndexedDB; restore before first paint; background revalidate;
  exclude auth/wallet/notifications; wipe on logout; never leak user A's data to user B.
- OUT: offline writes / mutation queue (P2-46); Dexie/local DB; SW runtime-cache changes
  (already tuned); new API endpoints (zero backend changes).

**Success criteria:**
1. Kill+reopen on a logged-in phone renders last screen's data before any network completes.
2. Online reopen still revalidates (same staleTimes as today — no freshness regression).
3. `wallet*` / `auth*` / `notifications*` never hit disk.
4. Sign-out (or 401 self-heal) wipes the persisted cache; next user starts clean.
5. Build + all tests green.

## Gate 2 — Architecture (delta only)

```
restore ─┐
         ├→ QueryClient (memory) ←→ hooks/components (unchanged)
persist ─┘        ↑ persistQueryClientSubscribe (every successful query)
        createIDBPersister (idb-keyval, store 'koralink-query-cache')
                  ↑ throttled 1s writes (persistQueryClient default)
Wipe hook: QueryCache.onSuccess → if key[0] ∈ NO_PERSIST → remove; persistQueryClient
           carries buster; wipe = persister.removeClient() + queryClient.clear()
Logout funnel: SignOutConfirmSheet / fetcher 401 / AuthBootstrap probe-fail → clearPersistedCache()
```

**Files changed:**

| File | Change |
|---|---|
| `apps/player-pwa/src/lib/query-persister.ts` | NEW — `createIDBPersister()` (idb-keyval, custom store, 2MB cap guard), `NO_PERSIST_PREFIXES`, `shouldPersistQuery()`, `clearPersistedQueryCache()` |
| `apps/player-pwa/src/providers/QueryProvider.tsx` | Wire `persistQueryClient` + `PersistQueryClientProvider` pattern (manual restore → set state → render children), `queryCache.onSuccess` scrubber |
| `apps/player-pwa/src/store/slices.ts` | `logout()` also calls `clearPersistedQueryCache()` (fire-and-forget, window-guarded) |
| `apps/player-pwa/test/lib/query-persister.test.ts` | NEW — exclusion matrix + wipe tests |

No API, schema, migration, i18n, or SW changes.

## Gate 3 — Program Design (contracts)

**Persister module contract:**

```ts
// lib/query-persister.ts
export const NO_PERSIST_PREFIXES: readonly string[]; // ['wallet','auth','notifications']
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean; // false if key[0] matches a prefix (string-compare, not deep)
export function createIDBPersister(): Persister; // inline zero-dep IndexedDB store 'koralink-query-cache' (lib/query-cache-db.ts); persistClient() strips NO_PERSIST queries before write
export async function clearPersistedQueryCache(): Promise<void>; // removeClient() on the store
```

> **Dependency note (2026-09-03):** the planned `idb-keyval` install was blocked twice by the
> terminal approval gate, so the slice ships with an **inline ~60-line promisified IndexedDB
> wrapper** (`lib/query-cache-db.ts`) instead — zero new dependencies, identical contract,
> smaller supply-chain surface. Only the DB plumbing differs; persister logic is unchanged.

**QueryProvider contract (mount order):**

```tsx
// providers/QueryProvider.tsx — restore BEFORE first children render
const [restored, setRestored] = useState(false);
useEffect(() => {
  persistQueryClient({ queryClient, persister, maxAge: 7 * 24 * 3600 * 1000, buster: PERSIST_BUSTER })
    .catch(() => {})           // corrupt/private-mode IDB → start clean, never crash
    .finally(() => setRestored(true));
}, []);
if (!restored) return children;  // first paint = server HTML + client shell (current behavior);
                                 // restored data paints on the tick after restore resolves
return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
```

**Restore timing (design decision):** mount children IMMEDIATELY — do NOT gate rendering on
restore completion (a gate would blank the app whenever IDB is slow, e.g. private-mode Safari).
Children render through the restore window exactly as they do today; when `persistQueryClient`
resolves, hydrated entries appear on the next render tick, and `refetchOnMount`/`staleTime`
behave unchanged. Worst case (restore fails/corrupt) = exactly today's behavior. The `restored`
state is kept only to satisfy React Query's SSR-hydration guidance; it never blocks paint.

**Exclusion contract (exact key[0] values, from the grepped inventory of 33 keys):**

| key[0] | Persist? | Rationale |
|---|---|---|
| `wallet` | ❌ | financial data on a shared phone; SW already NetworkOnly |
| `auth` | ❌ | session state |
| `notifications` | ❌ | per-device, high-churn |
| `matches`, `feed`, `venue`, `venues`, `pitch-slots`, `settings` | ✅ | public discovery data — the cold-start win |
| `match`, `user`, `users`, `dispute`, `pom`, `reports`, `conversation`, `conversations` | ✅ | private but user-keyed; wiped on logout |

**Data shapes:** `PersistedClient { buster, clientState { queries: [{ queryKey, queryHash,
state: { data, dataUpdatedAt, ... } }] } }` — serialized by React Query itself; we never
hand-parse it. `buster` = 'v1' bumped manually if the persisted shape ever needs invalidation.

**Observability (AGENTS §4):** PostHog `trackEvent('pwa_cache_hydrated', { queries_restored,
duration_ms })` + `'pwa_cache_cleared'` on wipe; Sentry `captureError` on restore failure.
Env-gated via existing ObservabilityProvider (no-ops when keys absent).

**Contract verification checklist:**
- [x] No backend endpoints touched — no response-shape drift possible
- [x] Frontend hook signatures unchanged — all `useQuery` hooks keep their keys/options
- [x] Adapter functions untouched — cache layer sits below them
- [x] No field silently undefined — persistence restores exactly what was cached
- [x] No i18n keys needed (no user-facing strings)
- [x] `wallet`/`auth`/`notifications` excluded (matches SW NetworkOnly intent; privacy on shared phones)
- [x] Logout wipe covers all 3 funnels (single `logout()` convergence point)
- [x] maxAge 7d + buster 'v1' prevent eternal stale data; staleTimes unchanged → no freshness regression
