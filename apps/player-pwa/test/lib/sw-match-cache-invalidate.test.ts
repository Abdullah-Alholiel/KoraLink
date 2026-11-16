import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MATCH_DETAIL_CACHE,
  invalidateMatchDetailCache,
  getLastMatchDetailInvalidation,
} from '@/lib/sw-match-cache-invalidate';

/**
 * P2-315: match mutations purge the SW `match-detail-cache` so a stale
 * cached detail can't keep a joinable CTA visible after the roster changed.
 */

const API = 'https://api.example.com/api/v1';

describe('invalidateMatchDetailCache (P2-315)', () => {
  const cacheDeleteMock = vi.fn<(req: { url: string }) => Promise<boolean>>(async () => true);
  const storageDeleteMock = vi.fn<(cacheName: string) => Promise<boolean>>(async () => true);
  const openMock = vi.fn<(cacheName: string) => Promise<unknown>>();
  let entries: { url: string }[] = [];

  beforeEach(() => {
    cacheDeleteMock.mockClear();
    storageDeleteMock.mockClear();
    openMock.mockReset();
    entries = [
      { url: `${API}/matches/abc` },
      { url: `${API}/matches/abc?lang=ar` },
      { url: `${API}/matches/abcd` },
      { url: `${API}/matches/other` },
      { url: `${API}/matches/abc/messages` },
    ];
    openMock.mockImplementation(async () => ({
      keys: vi.fn(async () => entries),
      delete: cacheDeleteMock,
    }));
    // jsdom has no CacheStorage — install a minimal stub.
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: openMock, delete: storageDeleteMock, keys: vi.fn(async () => []) },
    });
  });

  it('deletes only the entries for the given match id', async () => {
    await invalidateMatchDetailCache('abc');
    expect(openMock).toHaveBeenCalledWith(MATCH_DETAIL_CACHE);
    const deleted = cacheDeleteMock.mock.calls.map((c) => c[0].url);
    expect(deleted.sort()).toEqual([`${API}/matches/abc`, `${API}/matches/abc?lang=ar`].sort());
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it('drops the whole cache when no match id is given', async () => {
    await invalidateMatchDetailCache();
    expect(storageDeleteMock).toHaveBeenCalledTimes(1);
    expect(storageDeleteMock).toHaveBeenCalledWith('match-detail-cache');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('never rejects when caches.open fails', async () => {
    openMock.mockRejectedValueOnce(new Error('SecurityError'));
    await expect(invalidateMatchDetailCache('abc')).resolves.toBeUndefined();
  });

  it('never rejects when CacheStorage is unavailable', async () => {
    Object.defineProperty(window, 'caches', { configurable: true, value: undefined });
    await expect(invalidateMatchDetailCache('abc')).resolves.toBeUndefined();
  });

  it('getLastMatchDetailInvalidation returns the most recent promise', async () => {
    const p = invalidateMatchDetailCache('abc');
    expect(getLastMatchDetailInvalidation()).toBe(p);
    await p;
    const q = invalidateMatchDetailCache();
    expect(getLastMatchDetailInvalidation()).toBe(q);
    await expect(q).resolves.toBeUndefined();
  });
});
