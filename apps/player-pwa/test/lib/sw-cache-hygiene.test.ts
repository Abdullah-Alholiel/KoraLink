import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearUserRuntimeCaches, getLastRuntimeCachePurge } from '@/lib/sw-cache-hygiene';

/**
 * P2-121 (run #83): logout-time SW runtime-cache hygiene (PR-Agent security
 * MINOR on PR #46 — cached DMs must not outlive logout on a shared device).
 */

describe('clearUserRuntimeCaches (P2-121 logout cache hygiene)', () => {
  const deleteMock = vi.fn<(cacheName: string) => Promise<boolean>>(async () => true);

  beforeEach(() => {
    vi.resetModules();
    deleteMock.mockClear();
    // jsdom has no CacheStorage — install a minimal stub.
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        delete: deleteMock,
        keys: vi.fn(async () => []),
      },
    });
  });

  it('deletes every user-scoped runtime cache', async () => {
    await clearUserRuntimeCaches();
    const deleted = deleteMock.mock.calls.map((c) => c[0]);
    expect(deleted).toEqual(
      expect.arrayContaining([
        'conversation-messages-cache',
        'conversations-list-cache',
        'match-detail-cache',
        'user-profile-cache',
        'matches-feed-cache',
      ]),
    );
    expect(deleted).toHaveLength(5);
  });

  it('resolves (never throws) when CacheStorage is unavailable', async () => {
    Object.defineProperty(window, 'caches', { configurable: true, value: undefined });
    await expect(clearUserRuntimeCaches()).resolves.toBeUndefined();
  });

  it('swallows cache.delete rejections (logout must not hang or fail)', async () => {
    deleteMock.mockRejectedValueOnce(new Error('quota'));
    await expect(clearUserRuntimeCaches()).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledTimes(5);
  });

  it('getLastRuntimeCachePurge resolves only after an in-flight purge settles (run #84 race fix)', async () => {
    // Gate the FIRST delete on a deferred promise — the purge cannot finish
    // until we release it, so awaiting getLastRuntimeCachePurge() must block.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    deleteMock.mockImplementationOnce(async (name) => {
      if (name === 'conversation-messages-cache') await gate;
      return true;
    });

    const purge = clearUserRuntimeCaches();
    let settled = false;
    purge.then(() => (settled = true));

    // A microtask+timer round-trip: the gated delete has been REACHED but the
    // purge has NOT settled — getLastRuntimeCachePurge() must be the same
    // pending promise, not a stale resolved one.
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    release();
    await expect(getLastRuntimeCachePurge()).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });
});
