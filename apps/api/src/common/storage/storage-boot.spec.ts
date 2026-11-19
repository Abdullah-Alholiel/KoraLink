import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

/**
 * Storage boot posture specs (run #216 P0 — Render prod deploy crash).
 *
 * dep-dbuu8d59fdbs73b14bo0 (2026-11-18 17:45Z): StorageService THREW in its
 * constructor when S3_* env was absent, and StorageModule is @Global, so
 * every Nest boot without the (staging-only) SeaweedFS env died in DI —
 * Render prod crash-looped to update_failed while prod kept serving the old
 * build. These pins freeze the corrected posture: boot NEVER throws on
 * missing storage env; every storage method degrades typed instead.
 */

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

const FULL_ENV = {
  S3_ENDPOINT: 'http://127.0.0.1:8333/',
  S3_BUCKET_VENUES: 'koralink-venues',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-secret',
  S3_REGION: 'us-east-1',
  S3_BUCKET_AVATARS: 'koralink-avatars',
};

describe('StorageService boot posture (run #216)', () => {
  it('constructs WITHOUT throwing when S3_* env is entirely absent', () => {
    expect(() => new StorageService(makeConfig({}))).not.toThrow();
  });

  it('venuesConfigured=false and avatarConfigured=false with no env', () => {
    const svc = new StorageService(makeConfig({}));
    expect(svc.venuesConfigured).toBe(false);
    expect(svc.avatarConfigured).toBe(false);
  });

  it('venuesConfigured=true only when bucket AND creds are all present', () => {
    expect(new StorageService(makeConfig(FULL_ENV)).venuesConfigured).toBe(true);
    // Partial env: bucket without creds must NOT count as configured.
    const partial = new StorageService(
      makeConfig({ S3_BUCKET_VENUES: 'koralink-venues' }),
    );
    expect(partial.venuesConfigured).toBe(false);
  });

  it('endpoint defaults apply for absent optional keys (constructor completes)', () => {
    // Only S3_ENDPOINT-style optional keys omitted; nothing throws, getters
    // reflect exactly what was provided.
    const svc = new StorageService(
      makeConfig({ S3_BUCKET_VENUES: 'koralink-venues', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b' }),
    );
    expect(svc.venuesConfigured).toBe(true);
    expect(svc.avatarConfigured).toBe(false);
  });

  it('putVenueImage throws the typed unconfigured error when env absent', async () => {
    const svc = new StorageService(makeConfig({}));
    await expect(
      svc.putVenueImage('v1', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow('venues bucket not configured');
  });

  it('putVenueImage still rejects an empty body when storage IS configured', async () => {
    const svc = new StorageService(makeConfig(FULL_ENV));
    await expect(svc.putVenueImage('v1', Buffer.alloc(0), undefined)).rejects.toThrow(
      'empty body',
    );
  });

  it('getVenueImage degrades to null (404 path) when unconfigured', async () => {
    const svc = new StorageService(makeConfig({}));
    await expect(svc.getVenueImage('/media/venues/v1/abc.jpg')).resolves.toBeNull();
  });

  it('deleteVenueImage no-ops when unconfigured', async () => {
    const svc = new StorageService(makeConfig({}));
    await expect(
      svc.deleteVenueImage('/media/venues/v1/abc.jpg'),
    ).resolves.toBeUndefined();
  });

  it('avatar methods keep their existing unconfigured contract (regression pin)', async () => {
    const svc = new StorageService(makeConfig({}));
    await expect(svc.putAvatar('u1', Buffer.from('x'), undefined)).rejects.toThrow(
      'avatars bucket not configured',
    );
    await expect(svc.getAvatar('/media/avatars/u1/abc.jpg')).resolves.toBeNull();
    await expect(svc.deleteAvatar('/media/avatars/u1/abc.jpg')).resolves.toBeUndefined();
    expect(svc.avatarConfigured).toBe(false);
  });

  it('avatarConfigured stays true when ONLY venues env is missing', () => {
    const env: Record<string, string | undefined> = { ...FULL_ENV };
    delete env.S3_BUCKET_VENUES;
    const svc = new StorageService(makeConfig(env));
    expect(svc.venuesConfigured).toBe(false);
    expect(svc.avatarConfigured).toBe(true);
  });
});
