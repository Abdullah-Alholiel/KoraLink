/**
 * P2-238 (run #153, Reviewer A): completeProfile handle race — the pre-check
 * is check-then-act against the UNIQUE users.handle column, so the loser of a
 * concurrent claim hit a raw 23505 → HTTP 500. The fix catches 23505,
 * re-selects the winner, and returns the SAME 400 the pre-check throws.
 */
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';

describe('AuthService.completeProfile — handle race (P2-238)', () => {
  type Row = Record<string, unknown>;

  function makeDb(opts: {
    existingHandleOwner?: Row | null;
    updateResult?: Row;
    updateError?: Error;
    racedWinner?: Row | null;
  }) {
    const selectResults: Row[][] = [];
    // First select call = the pre-check; second (if any) = the race re-select.
    selectResults.push(opts.existingHandleOwner ? [opts.existingHandleOwner] : []);
    if (opts.racedWinner !== undefined) {
      selectResults.push(opts.racedWinner ? [opts.racedWinner] : []);
    }
    let selectCalls = 0;

    const db = {
      select: jest.fn(() => {
        const rows = selectResults[Math.min(selectCalls, selectResults.length - 1)];
        selectCalls += 1;
        return {
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve(rows),
            }),
          }),
        };
      }),
      update: jest.fn(() => ({
        set: () => ({
          where: () => ({
            returning: () =>
              opts.updateError
                ? Promise.reject(opts.updateError)
                : Promise.resolve(opts.updateResult ? [opts.updateResult] : []),
          }),
        }),
      })),
    };
    return db;
  }

  function makeService(db: ReturnType<typeof makeDb>) {
    return new AuthService(
      db as never,
      { sign: jest.fn().mockReturnValue('tok') } as never,
      { get: jest.fn(() => undefined), getOrThrow: jest.fn() } as never,
      { sendSms: jest.fn() } as never,
      {} as OtpStoreService,
    );
  }

  const dto = { handle: 'abdullah', full_name: 'Abdullah A' } as never;

  it('keeps the pre-check path: a taken handle throws 400 before any write', async () => {
    const db = makeDb({ existingHandleOwner: { id: 'user-B' } });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns the updated row on the happy path (no race)', async () => {
    const updated = { id: 'user-A', handle: 'abdullah' };
    const db = makeDb({ existingHandleOwner: null, updateResult: updated });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).resolves.toEqual(updated);
  });

  it('converts a 23505 race loss into the clean 400 (was a raw 500)', async () => {
    const race = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    const db = makeDb({
      existingHandleOwner: null,
      updateError: race,
      racedWinner: { id: 'user-B' },
    });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).rejects.toThrow(
      new BadRequestException('Handle already taken.'),
    );
  });

  it('reads the pg code through err.cause too (postgres-js wraps driver errors)', async () => {
    const race = Object.assign(new Error('wrapped'), {
      cause: { code: '23505' },
    });
    const db = makeDb({
      existingHandleOwner: null,
      updateError: race,
      racedWinner: { id: 'user-B' },
    });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).rejects.toThrow(
      new BadRequestException('Handle already taken.'),
    );
  });

  it('re-throws non-23505 update errors untouched', async () => {
    const boom = new Error('connection refused');
    const db = makeDb({ existingHandleOwner: null, updateError: boom });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).rejects.toThrow(boom);
  });

  it('re-throws 23505 when the re-select shows no other owner (defensive)', async () => {
    const race = Object.assign(new Error('23505'), { code: '23505' });
    const db = makeDb({
      existingHandleOwner: null,
      updateError: race,
      racedWinner: null,
    });
    const svc = makeService(db);

    await expect(svc.completeProfile('user-A', dto)).rejects.toThrow(race);
  });
});
