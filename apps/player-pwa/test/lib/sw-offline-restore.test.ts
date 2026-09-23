import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P2-73 (run #64): the offline restore KV contract shared by the service
 * worker (worker/index.js writes {u, t} into `koralink-offline-restore`)
 * and the offline page (src/lib/sw-offline-restore.ts reads + validates it).
 *
 * The reader is the contract enforcer: malformed payloads, non-http(s)
 * targets and stale (>24h) entries must never reach the UI — they are
 * dropped (stale/malformed are also deleted on read, self-healing).
 */

const NOW = 1_789_900_000_000; // fixed epoch for deterministic TTL math

function fakeCaches() {
  const store = new Map<string, Response>();
  const deleted: string[] = [];
  const cache = {
    match: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, res: Response) => {
      store.set(key, res);
    }),
    delete: vi.fn(async (key: string) => {
      deleted.push(key);
      return store.delete(key);
    }),
  };
  return {
    store,
    deleted,
    cache,
    impl: { open: vi.fn(async () => cache) },
  };
}

function putEntry(store: Map<string, Response>, value: unknown) {
  store.set('/__kl/restore-url', new Response(JSON.stringify(value)));
}

describe('readRestoreEntry (offline restore KV)', () => {
  let cachesApi: ReturnType<typeof fakeCaches>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    cachesApi = fakeCaches();
    vi.stubGlobal('caches', cachesApi.impl);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the saved entry when it is valid and fresh', async () => {
    putEntry(cachesApi.store, { u: 'https://host.test/ar/match/m1', t: NOW - 5_000 });
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toEqual({
      url: 'https://host.test/ar/match/m1',
      savedAt: NOW - 5_000,
    });
  });

  it('returns null and self-heals when there is no entry', async () => {
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toBeNull();
    expect(cachesApi.cache.delete).not.toHaveBeenCalled();
  });

  it('drops malformed JSON payloads', async () => {
    cachesApi.store.set(
      '/__kl/restore-url',
      new Response('not-json-at-all'),
    );
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toBeNull();
  });

  it('drops non-http(s) URLs (never reaches the UI)', async () => {
    putEntry(cachesApi.store, { u: 'javascript:alert(1)', t: NOW - 1_000 });
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toBeNull();
  });

  it('drops and DELETES stale (>24h) entries on read', async () => {
    putEntry(cachesApi.store, {
      u: 'https://host.test/en/play',
      t: NOW - 25 * 60 * 60 * 1000,
    });
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toBeNull();
    expect(cachesApi.cache.delete).toHaveBeenCalledWith('/__kl/restore-url');
  });

  it('returns null when the Cache API is unavailable (SSR/jsdom-less)', async () => {
    vi.unstubAllGlobals();
    const { readRestoreEntry } = await import('../../src/lib/sw-offline-restore');
    await expect(readRestoreEntry()).resolves.toBeNull();
  });
});
