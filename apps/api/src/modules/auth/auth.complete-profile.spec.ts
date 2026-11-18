/**
 * Cutover Card 2 (2026-11-16, P1) — completeProfile handle contract.
 *
 * A taken auto-derived handle must NEVER block sign-up: on collision with
 * ANOTHER user the server auto-picks a free suffixed handle (race-safe against
 * the UNIQUE users.handle index — the UPDATE is the truth, a 23505 loss
 * retries with a fresh pick). A handle the user already owns passes through.
 * Total contention exhaustion surfaces as 409 { code: 'HANDLE_TAKEN' } —
 * never the old 400 "Handle already taken." and never a raw 500.
 */
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';

type Row = Record<string, unknown>;

const UPDATED_ROW: Row = {
  id: 'user-A',
  phone: '+966500000009',
  full_name: 'Abdullah',
  handle: 'abdullah',
  avatar_url: null,
  preferred_location: null,
  preferred_position: null,
  role: 'Player',
};

const CODED_23505 = () =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });

/**
 * DB mock shaped to completeProfile's exact call sequence.
 *
 * select: consumed from selectQueue in order (last entry repeats). Each result
 * must serve BOTH shapes the service uses — `.where().limit()` (ownsHandle
 * pre-check, thenable via the promise) and a directly-awaited `.where()`
 * (pickFreeHandle's inArray lookup).
 * update: set() payloads captured; updateQueue consumed in order (last repeats).
 */
function makeDb(opts: {
  selectQueue: Row[][];
  updateQueue?: Array<{ ok?: Row; err?: Error }>;
}) {
  let selectIdx = 0;
  const setPayloads: Array<Record<string, unknown>> = [];
  let updateIdx = 0;

  const db = {
    select: jest.fn(() => ({
      from: () => ({
        where: () => {
          const rows =
            opts.selectQueue[
              Math.min(selectIdx++, opts.selectQueue.length - 1)
            ] ?? [];
          const p = Promise.resolve(rows);
          return {
            then: (
              onFulfilled?: (v: Row[]) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => p.then(onFulfilled, onRejected),
            limit: () => p,
          };
        },
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return {
          where: () => ({
            returning: () => {
              const u = (opts.updateQueue ?? [{ ok: UPDATED_ROW }])[
                Math.min(updateIdx++, (opts.updateQueue ?? [{ ok: UPDATED_ROW }]).length - 1)
              ];
              return u.err ? Promise.reject(u.err) : Promise.resolve(u.ok ? [u.ok] : []);
            },
          }),
        };
      }),
    })),
  };
  return { db, setPayloads };
}

function makeService(db: ReturnType<typeof makeDb>['db']) {
  return new AuthService(
    db as never,
    { sign: jest.fn().mockReturnValue('tok') } as never,
    { get: jest.fn(() => undefined), getOrThrow: jest.fn() } as never,
    { sendSms: jest.fn() } as never,
    {} as OtpStoreService,
  );
}

describe('AuthService.completeProfile — handle auto-pick (cutover Card 2)', () => {
  it('THE INCIDENT: name "Abdullah" with the handle already taken still completes sign-up with a suffixed handle', async () => {
    // New-user payload: NO handle sent (server derives from full_name).
    // Lookup finds 'abdullah' owned by user-B → auto-pick must suffix it.
    const { db, setPayloads } = makeDb({
      selectQueue: [[{ id: 'user-B', handle: 'abdullah' }]],
    });
    const svc = makeService(db);

    const result = await svc.completeProfile('user-A', {
      full_name: 'Abdullah',
    } as never);

    expect(result).toMatchObject({ id: 'user-A' });
    expect(setPayloads).toHaveLength(1);
    const sentHandle = setPayloads[0].handle as string;
    expect(sentHandle).not.toBe('abdullah');
    expect(sentHandle).toMatch(/^abdullah_\d{2,3}$/);
  });

  it('a free derived handle is used verbatim (no suffix)', async () => {
    const { db, setPayloads } = makeDb({ selectQueue: [[]] });
    const svc = makeService(db);

    await svc.completeProfile('user-A', { full_name: 'Abdullah' } as never);

    expect(setPayloads[0].handle).toBe('abdullah');
  });

  it('legacy client sends a taken handle → auto-picks a free one (no 400)', async () => {
    // Call 1: ownsHandle pre-check (owner is user-B → not ours).
    // Call 2: pickFreeHandle lookup ('abdullah' taken).
    const { db, setPayloads } = makeDb({
      selectQueue: [
        [{ id: 'user-B', handle: 'abdullah' }],
        [{ id: 'user-B', handle: 'abdullah' }],
      ],
    });
    const svc = makeService(db);

    const result = await svc.completeProfile('user-A', {
      full_name: 'Abdullah A',
      handle: 'abdullah',
    } as never);

    expect(result).toMatchObject({ id: 'user-A' });
    const sentHandle = setPayloads[0].handle as string;
    expect(sentHandle).not.toBe('abdullah');
    expect(sentHandle).toMatch(/^abdullah_\d{2,3}$/);
  });

  it('re-saving the SAME user\'s own handle passes through untouched (zero extra lookups)', async () => {
    // Call 1: ownsHandle pre-check — owner IS user-A.
    const { db, setPayloads } = makeDb({
      selectQueue: [[{ id: 'user-A', handle: 'my_handle' }]],
    });
    const svc = makeService(db);

    const result = await svc.completeProfile('user-A', {
      full_name: 'Tester T',
      handle: 'my_handle',
    } as never);

    expect(result).toMatchObject({ id: 'user-A' });
    expect(setPayloads[0].handle).toBe('my_handle');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('an Arabic-only name derives the "player" base (slug of Arabic script is empty)', async () => {
    const { db, setPayloads } = makeDb({ selectQueue: [[]] });
    const svc = makeService(db);

    await svc.completeProfile('user-A', { full_name: 'محمد' } as never);

    expect(setPayloads[0].handle).toMatch(/^player_\d{2,3}$/);
  });

  it('a 23505 race loss retries with a fresh pick and succeeds (was a raw 500)', async () => {
    const { db, setPayloads } = makeDb({
      selectQueue: [[]], // repeats: every lookup sees nothing taken
      updateQueue: [{ err: CODED_23505() }, { ok: UPDATED_ROW }],
    });
    const svc = makeService(db);

    const result = await svc.completeProfile('user-A', {
      full_name: 'Abdullah',
    } as never);

    expect(result).toMatchObject({ id: 'user-A' });
    // First attempt lost the UNIQUE race; the retry performed a second UPDATE.
    expect(setPayloads).toHaveLength(2);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('exhausting the race retries surfaces 409 HANDLE_TAKEN (machine code for the PWA)', async () => {
    const { db } = makeDb({
      selectQueue: [[]],
      updateQueue: [
        { err: CODED_23505() },
        { err: CODED_23505() },
        { err: CODED_23505() },
      ],
    });
    const svc = makeService(db);

    const err = await svc.completeProfile('user-A', {
      full_name: 'Abdullah',
    } as never).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const httpErr = err as ConflictException;
    expect(httpErr.getStatus()).toBe(409);
    expect((httpErr.getResponse() as { code?: string }).code).toBe('HANDLE_TAKEN');
  });

  it('non-23505 update errors are re-thrown untouched', async () => {
    const boom = new Error('connection refused');
    const { db } = makeDb({
      selectQueue: [[]],
      updateQueue: [{ err: boom }],
    });
    const svc = makeService(db);

    await expect(
      svc.completeProfile('user-A', { full_name: 'Abdullah' } as never),
    ).rejects.toThrow(boom);
  });
});
