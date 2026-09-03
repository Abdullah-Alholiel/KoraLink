import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCache, QueryClient } from '@tanstack/react-query';

// ── Fake IndexedDB (in-memory Map with IDB's structured-clone semantics) ──
// The spies ARE the implementation (the vi.mock factory just delegates), so
// mockImplementationOnce(...) swaps real behavior for a failing IDB and
// mockClear() only resets call history.
const fakeDb = new Map<string, unknown>();
const idbSetSpy = vi.fn((key: string, value: unknown) => {
  fakeDb.set(key, structuredClone(value));
  return Promise.resolve();
});
const idbRemoveSpy = vi.fn((key: string) => {
  fakeDb.delete(key);
  return Promise.resolve();
});
const idbGetSpy = vi.fn((key: string) =>
  Promise.resolve(structuredClone(fakeDb.get(key)))
);

vi.mock('@/lib/query-cache-db', () => ({
  idbGet: (key: string) => idbGetSpy(key),
  idbSet: (key: string, value: unknown) => idbSetSpy(key, value),
  idbRemove: (key: string) => idbRemoveSpy(key),
}));

// Observability is env-gated in prod; stub the helpers so we can assert events.
const trackEventSpy = vi.fn();
const captureErrorSpy = vi.fn();
vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
  captureError: (...args: unknown[]) => captureErrorSpy(...args),
  addBreadcrumb: vi.fn(),
}));

import {
  NO_PERSIST_PREFIXES,
  PERSIST_BUSTER,
  attachCachePersistence,
  clearPersistedQueryCache,
  shouldPersistQuery,
} from '@/lib/query-persister';

function flushRestore() {
  // Restore chain is promise-based; yield a macrotask so it settles.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fakeDb.clear();
  idbSetSpy.mockClear();
  idbRemoveSpy.mockClear();
  idbGetSpy.mockClear();
  trackEventSpy.mockClear();
  captureErrorSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Exclusion matrix ───────────────────────────────────────────────

describe('shouldPersistQuery exclusion matrix (P2-45)', () => {
  it('excludes wallet / auth / notifications namespaces', () => {
    expect(shouldPersistQuery(['wallet', 'balance'])).toBe(false);
    expect(shouldPersistQuery(['wallet', 'history', { page: 1 }])).toBe(false);
    expect(shouldPersistQuery(['auth', 'bootstrap'])).toBe(false);
    expect(shouldPersistQuery(['notifications', 'unread-count'])).toBe(false);
    expect(NO_PERSIST_PREFIXES).toEqual(['wallet', 'auth', 'notifications']);
  });

  it('persists public discovery + user-scoped namespaces', () => {
    expect(shouldPersistQuery(['matches', { date: null }])).toBe(true);
    expect(shouldPersistQuery(['feed'])).toBe(true);
    expect(shouldPersistQuery(['venues', {}])).toBe(true);
    expect(shouldPersistQuery(['venue', 'v1'])).toBe(true);
    expect(shouldPersistQuery(['pitch-slots', 'p1', '2026-09-03'])).toBe(true);
    expect(shouldPersistQuery(['settings', 'public'])).toBe(true);
    expect(shouldPersistQuery(['user', 'my-matches'])).toBe(true);
    expect(shouldPersistQuery(['match', 'm1', { currentUserId: 'u1' }])).toBe(true);
    expect(shouldPersistQuery(['dispute', 'm1'])).toBe(true);
    expect(shouldPersistQuery(['conversations'])).toBe(true);
  });

  it('persists non-string first segments (only exact string prefixes are excluded)', () => {
    expect(shouldPersistQuery([123])).toBe(true);
    expect(shouldPersistQuery([{ filters: true }])).toBe(true);
    expect(shouldPersistQuery([])).toBe(true);
  });
});

// ─── Persist + restore round-trip (real dehydrate/hydrate, fake IDB) ────

describe('attachCachePersistence round-trip', () => {
  it('writes successful non-excluded queries to IDB after the throttle window', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(client);
    // Settle the restore chain so the cache subscription is attached BEFORE
    // we generate events (empty disk → restore resolves with nothing).
    await vi.advanceTimersByTimeAsync(0);
    client.setQueryData(['matches'], [{ id: 'm1' }]);
    // Not yet persisted (inside the 1s throttle window).
    expect(fakeDb.has('query-client')).toBe(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(fakeDb.has('query-client')).toBe(true);
    detach();
    client.clear();
  });

  it('never writes excluded queries, even mixed into the same session', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(client);
    await vi.advanceTimersByTimeAsync(0); // subscription attached
    client.setQueryData(['matches'], [{ id: 'm1' }]);
    client.setQueryData(['wallet', 'balance'], 420);
    client.setQueryData(['auth', 'bootstrap'], { ok: true });
    client.setQueryData(['notifications', 'unread-count'], 7);
    await vi.advanceTimersByTimeAsync(1100);
    const stored = fakeDb.get('query-client') as {
      clientState: { queries: { queryKey: unknown[] }[] };
    };
    const persistedKeys = stored.clientState.queries.map((q) => q.queryKey[0]);
    expect(persistedKeys).toContain('matches');
    expect(persistedKeys).not.toContain('wallet');
    expect(persistedKeys).not.toContain('auth');
    expect(persistedKeys).not.toContain('notifications');
    detach();
    client.clear();
  });

  it('restores a fresh snapshot into a new client before any network runs', async () => {
    // Seed disk with a snapshot exactly as a previous session would have
    // written it (a successful ['matches'] query, dehydrated shape).
    fakeDb.set(
      'query-client',
      structuredClone({
        buster: PERSIST_BUSTER,
        timestamp: Date.now(),
        clientState: {
          mutations: [],
          queries: [
            {
              queryKey: ['matches'],
              queryHash: JSON.stringify(['matches']),
              state: {
                data: [{ id: 'm1' }],
                dataUpdateCount: 1,
                dataUpdatedAt: Date.now(),
                error: null,
                errorUpdateCount: 0,
                errorUpdatedAt: 0,
                fetchFailureCount: 0,
                fetchFailureReason: null,
                fetchMeta: null,
                isInvalidated: false,
                status: 'success',
                fetchStatus: 'idle',
              },
            },
          ],
        },
      })
    );

    const fresh = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(fresh);
    await flushRestore();
    expect(fresh.getQueryData(['matches'])).toEqual([{ id: 'm1' }]);
    expect(trackEventSpy).toHaveBeenCalledWith(
      'pwa_cache_hydrated',
      expect.objectContaining({ queries_restored: 1 })
    );
    detach();
    fresh.clear();
  });

  it('discards snapshots with an outdated buster (invalidation path)', async () => {
    fakeDb.set('query-client', {
      buster: 'v0',
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['matches'],
            queryHash: '["matches"]',
            state: { data: ['stale'], status: 'success', fetchStatus: 'idle', dataUpdatedAt: Date.now() },
          },
        ],
      },
    });
    const fresh = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(fresh);
    await flushRestore();
    expect(fresh.getQueryData(['matches'])).toBeUndefined();
    expect(idbRemoveSpy).toHaveBeenCalledWith('query-client');
    detach();
    fresh.clear();
  });

  it('discards snapshots older than 7 days', async () => {
    fakeDb.set('query-client', {
      buster: PERSIST_BUSTER,
      timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['matches'],
            queryHash: '["matches"]',
            state: { data: ['old'], status: 'success', fetchStatus: 'idle', dataUpdatedAt: Date.now() },
          },
        ],
      },
    });
    const fresh = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(fresh);
    await flushRestore();
    expect(fresh.getQueryData(['matches'])).toBeUndefined();
    detach();
    fresh.clear();
  });

  it('survives IndexedDB failure without throwing (worst case = today)', async () => {
    idbGetSpy.mockImplementationOnce(() =>
      Promise.reject(new Error('IndexedDB unavailable'))
    );
    const fresh = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(fresh);
    await flushRestore();
    expect(fresh.getQueryData(['matches'])).toBeUndefined();
    expect(captureErrorSpy).toHaveBeenCalled();
    detach();
    fresh.clear();
  });

  it('restored dataUpdatedAt carries over so staleTime semantics hold', async () => {
    const dataUpdatedAt = Date.now() - 30 * 1000; // 30s ago — older than default 60s? no: FRESH
    fakeDb.set('query-client', {
      buster: PERSIST_BUSTER,
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['venues', {}],
            queryHash: JSON.stringify(['venues', {}]),
            state: {
              data: [{ id: 'v1' }],
              dataUpdateCount: 1,
              dataUpdatedAt,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
        ],
      },
    });
    const fresh = new QueryClient({ queryCache: new QueryCache() });
    const detach = attachCachePersistence(fresh);
    await flushRestore();
    const state = fresh.getQueryState(['venues', {}]);
    expect(state?.dataUpdatedAt).toBe(dataUpdatedAt);
    expect(state?.status).toBe('success');
    expect(state?.fetchStatus).toBe('idle'); // no fetch kicked off by restore itself
    detach();
    fresh.clear();
  });
});

// ─── Wipe ───────────────────────────────────────────────────────────

describe('clearPersistedQueryCache', () => {
  it('removes the persisted snapshot from IndexedDB', async () => {
    fakeDb.set('query-client', { buster: PERSIST_BUSTER, timestamp: Date.now(), clientState: { mutations: [], queries: [] } });
    await clearPersistedQueryCache();
    expect(idbRemoveSpy).toHaveBeenCalledWith('query-client');
    expect(fakeDb.has('query-client')).toBe(false);
    expect(trackEventSpy).toHaveBeenCalledWith('pwa_cache_cleared');
  });
});
