import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MailerUsersService } from './mailer-users.service';

/**
 * Run #36 (Reviewer A follow-up) — setEmail error contract.
 *
 * The old service threw stringly `Error`s and the controller mapped EVERYTHING
 * unknown to 400 "Invalid email address" — a DB outage or a lost TOCTOU race
 * surfaced as a client mistake. Now: typed exceptions 1:1 (400 invalid /
 * 409 taken / 404 no-user) + the UPDATE's .returning() as the existence check
 * + migration 0033's LOWER(email) unique index mapped to 409 on race loss.
 */

function makeDb(opts: {
  conflictRows?: unknown[];
  returningRows?: unknown[];
  updateErr?: { code?: string };
}) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(opts.conflictRows ?? []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => {
            if (opts.updateErr) throw opts.updateErr;
            return Promise.resolve(opts.returningRows ?? []);
          },
        }),
      }),
    }),
  };
}

function makeService(dbOpts: Parameters<typeof makeDb>[0]): MailerUsersService {
  return new MailerUsersService(
    makeDb(dbOpts) as never,
    {
      sendVerificationEmail: async () => ({
        userId: 'u1',
        status: 'skipped' as const,
        reason: 'transport-unconfigured' as const,
      }),
    } as never,
    { signAsync: async () => 'tok' } as never,
    { get: (_k: string, d?: string) => d } as never,
  );
}

describe('MailerUsersService.setEmail error contract (run #36)', () => {
  it('invalid format → BadRequestException (400)', async () => {
    await expect(makeService({}).setEmail('u1', 'not-an-email')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('address in use (pre-check) → ConflictException (409)', async () => {
    const svc = makeService({ conflictRows: [{ id: 'someone-else' }] });
    await expect(svc.setEmail('u1', 'a@x.com')).rejects.toBeInstanceOf(ConflictException);
  });

  it('happy path → { email, emailVerified: false, verificationSent }', async () => {
    const svc = makeService({ returningRows: [{ id: 'u1' }] });
    await expect(svc.setEmail('u1', 'A@X.com ')).resolves.toEqual({
      email: 'a@x.com',
      emailVerified: false,
      verificationSent: false,
    });
  });

  it('lost TOCTOU race (pg 23505 unique violation) → ConflictException, not 500', async () => {
    const svc = makeService({ updateErr: { code: '23505' } });
    await expect(svc.setEmail('u1', 'a@x.com')).rejects.toBeInstanceOf(ConflictException);
  });

  it('UPDATE .returning() empty (no such user) → NotFoundException (404)', async () => {
    const svc = makeService({ returningRows: [] });
    await expect(svc.setEmail('ghost', 'a@x.com')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unexpected DB failure propagates (global filter → 500 + Sentry)', async () => {
    const svc = makeService({ updateErr: { code: '08006' } });
    await expect(svc.setEmail('u1', 'a@x.com')).rejects.toMatchObject({ code: '08006' });
  });
});
