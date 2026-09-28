import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearUserRuntimeCaches } from '@/lib/sw-cache-hygiene';

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
      ]),
    );
    expect(deleted).toHaveLength(4);
  });

  it('resolves (never throws) when CacheStorage is unavailable', async () => {
    Object.defineProperty(window, 'caches', { configurable: true, value: undefined });
    await expect(clearUserRuntimeCaches()).resolves.toBeUndefined();
  });

  it('swallows cache.delete rejections (logout must not hang or fail)', async () => {
    deleteMock.mockRejectedValueOnce(new Error('quota'));
    await expect(clearUserRuntimeCaches()).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledTimes(4);
  });
});
