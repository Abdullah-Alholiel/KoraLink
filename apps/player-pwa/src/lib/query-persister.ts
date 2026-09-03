/**
 * Persisted query cache for KoraLink PWA (P2-45 — offline-first cold start).
 *
 * Implements the React Query persistence protocol inline (upstream lives in
 * the uninstalled `@tanstack/query-persist-client` package): dehydrate the
 * client → store → restore → hydrate. Built on public v5 API only:
 * `dehydrate`, `hydrate`, `defaultShouldDehydrateQuery`, `QueryCache.subscribe`.
 *
 * Behavior contract (docs/plans/pwa-cache-persistence/01-program-design.md):
 * - Cold open restores the last cached data from IndexedDB BEFORE network
 *   responses arrive; staleTime/refetchOnMount then refresh exactly as before.
 * - `wallet*`, `auth*`, `notifications*` queries are NEVER written to disk
 *   (financial/session privacy on shared devices — mirrors the SW's
 *   NetworkOnly rules for the same endpoints).
 * - `clearPersistedQueryCache()` wipes the disk copy; called from the Zustand
 *   `logout()` funnel so user B never sees user A's cached rows.
 * - Every failure is caught upstream: persistence is best-effort. Worst case
 *   (IDB unavailable, corrupt payload, quota) = the app behaves exactly as it
 *   did before this feature.
 */

import {
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  type DehydratedState,
  type QueryCacheNotifyEvent,
  type QueryClient,
} from '@tanstack/react-query';
import { captureError, trackEvent } from '@/providers/ObservabilityProvider';
import { idbGet, idbRemove, idbSet } from '@/lib/query-cache-db';

// Re-exported so declaration emit never sees a private name in this module's
// exported signatures (the event type is used by the internal subscriber).
export type { QueryCacheNotifyEvent };

/** Payload shape stored in IndexedDB (mirrors upstream `PersistedClient`). */
export interface PersistedClient {
  /** Bump to invalidate every persisted cache (shape/wiring changes). */
  buster: string;
  timestamp: number;
  clientState: DehydratedState;
}

/** Upstream-compatible `Persister` interface (react-query-persist-client). */
export interface Persister {
  persistClient(persistClient: PersistedClient): void;
  restoreClient(): Promise<PersistedClient | undefined>;
  removeClient(): Promise<void>;
}

/** Single key — the whole client is one dehydrated snapshot. */
const PERSIST_KEY = 'query-client';
export const PERSIST_BUSTER = 'v1';
/** Restored data older than this is discarded on restore (not eternal). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Coalesce bursts of cache events into at most one IDB write per second. */
const THROTTLE_MS = 1000;

/**
 * Query keys whose FIRST segment matches one of these prefixes are excluded
 * from persistence. Inventory basis: full `queryKey:` grep of src/ (33 keys,
 * 2026-09-03). Keep in sync when adding a sensitive query namespace.
 */
export const NO_PERSIST_PREFIXES: readonly string[] = [
  'wallet', // financial data — never on disk (SW rule: NetworkOnly /api/wallet)
  'auth', // session state (['auth', 'bootstrap'])
  'notifications', // per-device, high-churn counts
];

/** True when the query's first key segment is an excluded namespace. */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  return !(typeof first === 'string' && NO_PERSIST_PREFIXES.includes(first));
}

/** Only successful fetches are worth persisting — never errors/pending. */
function shouldPersistEvent(event: QueryCacheNotifyEvent): boolean {
  // v5 signals a completed fetch as an `updated` event with a `success` action
  // (the `added`/`removed`/`observer*` events never carry fresh data).
  if (event.type !== 'updated') return false;
  if (event.action.type !== 'success') return false;
  return shouldPersistQuery(event.query.queryKey);
}

/** Strip excluded queries from a dehydrated snapshot before it hits disk. */
function filterDehydrated(state: DehydratedState): DehydratedState {
  const queries = state.queries.filter((q) => shouldPersistQuery(q.queryKey));
  return { ...state, queries };
}

/**
 * Create the throttled IndexedDB persister. One instance per QueryClient —
 * attach via `attachCachePersistence` (below), not directly.
 */
export function createIDBPersister(): Persister {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const writeNow = (client: PersistedClient) => {
    idbSet(PERSIST_KEY, { ...client, clientState: filterDehydrated(client.clientState) }).catch(
      (err) => captureError(err, { scope: 'pwa-cache-persist' })
    );
  };

  return {
    persistClient(persistClient: PersistedClient) {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveTimeout = null;
        writeNow(persistClient);
      }, THROTTLE_MS);
    },
    async restoreClient() {
      const cached = await idbGet<PersistedClient>(PERSIST_KEY);
      if (!cached) return undefined;
      if (cached.buster !== PERSIST_BUSTER || Date.now() - cached.timestamp > MAX_AGE_MS) {
        await idbRemove(PERSIST_KEY).catch(() => undefined);
        return undefined;
      }
      return cached;
    },
    async removeClient() {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      await idbRemove(PERSIST_KEY);
    },
  };
}

/**
 * Restore the persisted cache into `queryClient`, then keep the disk snapshot
 * fresh (throttled) for the session. Returns an unsubscribe function for
 * React effect cleanup.
 *
 * Ordering note: `hydrate` only overwrites an existing query when its
 * dehydrated `dataUpdatedAt` is NEWER, so any fetch that completed during the
 * restore window safely wins over older disk data. The subscription is
 * attached AFTER hydration so restore itself doesn't trigger a redundant write.
 */
export function attachCachePersistence(queryClient: QueryClient): () => void {
  const persister = createIDBPersister();
  let cancelled = false;

  persister
    .restoreClient()
    .then((restored) => {
      if (cancelled) return;
      if (restored) {
        hydrate(queryClient, restored.clientState);
      }
      trackEvent('pwa_cache_hydrated', {
        queries_restored: restored?.clientState.queries.length ?? 0,
      });
      // Keep the snapshot fresh for the rest of the session.
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (!shouldPersistEvent(event)) return;
        persister.persistClient({
          buster: PERSIST_BUSTER,
          timestamp: Date.now(),
          clientState: dehydrate(queryClient, { shouldDehydrateQuery: defaultShouldDehydrateQuery }),
        });
      });
      // Chain cleanup: if the effect unmounted during restore, detach now.
      if (cancelled) unsubscribe();
      else cleanupFns.push(unsubscribe);
    })
    .catch((err) => {
      // Restore failure is never fatal — the app already renders without it.
      captureError(err, { scope: 'pwa-cache-restore' });
    });

  const cleanupFns: Array<() => void> = [];
  return () => {
    cancelled = true;
    cleanupFns.forEach((fn) => fn());
  };
}

/**
 * Public wipe — called from the Zustand `logout()` funnel (all three paths:
 * SignOutConfirmSheet, fetcher 401 self-heal, AuthBootstrap probe-fail).
 * Removes the persisted snapshot only; in-memory cache is intentionally left
 * to the existing logout flows (all of which hard-navigate or refetch).
 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await idbRemove(PERSIST_KEY);
    trackEvent('pwa_cache_cleared');
  } catch (err) {
    captureError(err, { scope: 'pwa-cache-clear' });
  }
}
