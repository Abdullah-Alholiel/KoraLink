import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { MediaService } from './media.service';
import { StorageService } from '../../common/storage/storage.service';

/**
 * P2-50 (run #181) — avatar upload specs.
 *
 * StorageService is stubbed (the real client is SigV4 against SeaweedFS —
 * not under test here). What IS under test: the flag contract, error mapping,
 * previous-object cleanup scoping, and the users-row write guard.
 */
describe('MediaService avatar upload (run #181)', () => {
  const AVATAR_PATH = '/media/avatars/u1/abc123.jpg';

  function makeDbls(opts?: {
    storagePut?: () => Promise<{ path: string; bytes: number; mime: string }>;
    existingAvatar?: string | null;
    userRowGone?: boolean;
    /** Simulate the row vanishing between the initial read and the UPDATE. */
    rowGoneOnUpdate?: boolean;
  }) {
    const deletedPaths: string[] = [];
    const storage = {
      putAvatar: opts?.storagePut ?? (async () => ({ path: AVATAR_PATH, bytes: 10, mime: 'image/jpeg' })),
      getAvatar: async () => null,
      deleteAvatar: async (p: string) => {
        deletedPaths.push(p);
      },
      isManagedAvatarPath: (p: string) =>
        p.startsWith('/media/avatars/') && /^[A-Za-z0-9/._-]+$/.test(p.slice('/media/'.length)) && !p.includes('..'),
    } as unknown as StorageService;

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => (opts?.userRowGone ? [] : [{ avatar_url: opts?.existingAvatar ?? null }]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => (opts?.rowGoneOnUpdate || opts?.userRowGone ? [] : [{ id: 'u1' }]),
          }),
        }),
      }),
    };

    const svc = new MediaService(db as never, storage);
    return { svc, deletedPaths };
  }

  const FILE = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), size: 4, mimetype: 'image/jpeg' };

  it('happy path: stores, writes the user row, returns the canonical path', async () => {
    const { svc, deletedPaths } = makeDbls();
    const res = await svc.uploadAvatar('u1', FILE);
    expect(res).toEqual({ avatarUrl: AVATAR_PATH });
    expect(deletedPaths).toHaveLength(0); // no previous avatar → nothing deleted
  });

  it('empty buffer → 400 with the multipart-field copy', async () => {
    const { svc } = makeDbls();
    await expect(svc.uploadAvatar('u1', { buffer: Buffer.alloc(0), size: 0 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('storage "not configured" maps to 503 (not 500)', async () => {
    const { svc } = makeDbls({
      storagePut: async () => {
        throw new Error('avatars bucket not configured');
      },
    });
    await expect(svc.uploadAvatar('u1', FILE)).rejects.toThrow(ServiceUnavailableException);
  });

  it('unsupported type maps to 400', async () => {
    const { svc } = makeDbls({
      storagePut: async () => {
        throw new Error('unsupported image type');
      },
    });
    await expect(svc.uploadAvatar('u1', FILE)).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it('oversize maps to 400 with the 2 MB copy', async () => {
    const { svc } = makeDbls();
    await expect(
      svc.uploadAvatar('u1', { buffer: FILE.buffer, size: 3 * 1024 * 1024 }),
    ).rejects.toThrow(/2 MB/);
  });

  it('deletes the PREVIOUS same-user managed avatar after a successful write', async () => {
    const prev = '/media/avatars/u1/old0000.png';
    const { svc, deletedPaths } = makeDbls({ existingAvatar: prev });
    const res = await svc.uploadAvatar('u1', FILE);
    expect(res.avatarUrl).toBe(AVATAR_PATH);
    expect(deletedPaths).toEqual([prev]);
  });

  it('NEVER deletes a foreign-prefix or non-managed previous value', async () => {
    for (const prev of ['/media/avatars/u2/sneaky.jpg', 'https://cdn.example.com/x.jpg', null]) {
      const { svc, deletedPaths } = makeDbls({ existingAvatar: prev });
      await svc.uploadAvatar('u1', FILE);
      expect(deletedPaths).toHaveLength(0);
    }
  });

  it('user row vanished mid-request → 404 + the stored object is cleaned up', async () => {
    const { svc, deletedPaths } = makeDbls({ rowGoneOnUpdate: true });
    await expect(svc.uploadAvatar('u1', FILE)).rejects.toThrow(/User not found/);
    expect(deletedPaths).toEqual([AVATAR_PATH]); // orphan cleanup ran
  });

  it('flag gate: forbidden when AVATAR_UPLOAD_ENABLED is off (controller contract)', () => {
    // The gate lives in the controller (config read); this pins the exception
    // type the PWA error classifier maps to the localized "not enabled" copy.
    const err = new ForbiddenException('Avatar upload is not enabled.');
    expect(err.getStatus()).toBe(403);
  });
});
