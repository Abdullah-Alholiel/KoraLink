/**
 * Cutover Card 2 companion (2026-11-16) — PATCH /users/me handle guard.
 * A handle owned by ANOTHER user must surface as 409 { code: 'HANDLE_TAKEN' }
 * (the profile-settings screen classifies it) — never the raw 23505 → HTTP 500
 * this path produced before. Self-owned and unchanged handles pass through.
 */
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

const RETURNED_ROW = {
  id: 'u1',
  phone: '+966****0001',
  full_name: 'Tester',
  handle: 'my_handle',
  avatar_url: null,
  preferred_location: null,
  preferred_position: null,
  role: 'Player',
  home_lat: null,
  home_lng: null,
  locale: 'en',
};

function setup(selectResults: Array<Array<Record<string, unknown>>>) {
  let selectIdx = 0;
  const db = {
    select: jest.fn(() => ({
      from: () => ({
        where: () => {
          const rows = selectResults[selectIdx++] ?? [];
          const p = Promise.resolve(rows);
          return { limit: () => p };
        },
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: () => ({
          returning: jest.fn().mockResolvedValue([RETURNED_ROW]),
        }),
      })),
    })),
  };
  const service = new UsersService(
    db as never,
    {} as never, // jwt (unused by updateProfile)
    {} as never, // config (unused by updateProfile)
  );
  return { service, db };
}

describe('UsersService.updateProfile — handle collision guard', () => {
  it('a handle owned by ANOTHER user throws 409 HANDLE_TAKEN before any write', async () => {
    const { service, db } = setup([[{ id: 'user-B' }]]);

    const err = await service
      .updateProfile('u1', { handle: 'abdullah' } as never)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getStatus()).toBe(409);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'HANDLE_TAKEN',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('the SAME user re-saving their own handle passes (no exception, update runs)', async () => {
    const { service, db } = setup([[{ id: 'u1' }]]);

    const result = await service.updateProfile('u1', {
      handle: 'my_handle',
    } as never);

    expect(result).toMatchObject({ id: 'u1' });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('a free handle passes (empty lookup)', async () => {
    const { service } = setup([[]]);

    const result = await service.updateProfile('u1', {
      handle: 'brand_new',
    } as never);

    expect(result).toMatchObject({ id: 'u1' });
  });

  it('no handle in the dto → zero handle lookups (other profile fields still save)', async () => {
    const { service, db } = setup([]);

    const result = await service.updateProfile('u1', {
      full_name: 'New Name',
    } as never);

    expect(result).toMatchObject({ id: 'u1' });
    // select is only added by the handle guard — absent here.
    expect(db.select).not.toHaveBeenCalled();
  });
});
