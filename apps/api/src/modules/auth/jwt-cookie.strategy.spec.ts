import { JwtCookieStrategy } from './jwt-cookie.strategy';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * P1-36 (run #31) — restore-purpose JWT scope gate.
 *
 * While a user is soft-deleted (PDPL), a `purpose: 'restore'` JWT may do
 * exactly ONE thing: restore the account. These specs pin the gate matrix
 * on jwt-cookie.strategy.validate() directly (the highest-risk branch in
 * the PDPL chain per Reviewer A run #31 CRITICAL C1):
 *
 *   deleted + regular token            → 401 (pre-existing behavior)
 *   deleted + restore token, restore route, in window → PASS (the only happy path)
 *   deleted + restore token, /admin/*  → 403 (admin surface is closed)
 *   deleted + restore token, past iat+30d → 403 (ghost rows stay dead)
 *   active + restore token, any route  → 403 (spent-token replay guard,
 *                                        run #31 resume — a restore token
 *                                        is never a session token)
 *   active + regular token             → unaffected
 */
describe('JwtCookieStrategy P1-36 restore-token scope gate (run #31)', () => {
  const NOW_S = Math.floor(Date.now() / 1000);

  function makeStrategy(userRow: {
    id: string;
    role: string;
    banned_at: Date | null;
    suspended_until: Date | null;
    deleted_at: Date | null;
  } | null) {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (userRow ? [userRow] : []),
          }),
        }),
      }),
    };
    const config = {
      getOrThrow: (k: string) => {
        if (k === 'JWT_SECRET') return 'test-secret-do-not-use-in-prod';
        throw new Error(`missing config ${k}`);
      },
    } as unknown as ConfigService;
    return new JwtCookieStrategy(config, db as never);
  }

  const activeUser = {
    id: 'u1',
    role: 'Player',
    banned_at: null,
    suspended_until: null,
    deleted_at: null,
  };
  const deletedUser = { ...activeUser, deleted_at: new Date('2026-09-01T00:00:00Z') };

  const restoreToken = (iatSecondsAgo = 10): { sub: string; phone: string; role: string; purpose: 'restore'; iat: number } => ({
    sub: 'u1',
    phone: '+966500000001',
    role: 'Player',
    purpose: 'restore',
    iat: NOW_S - iatSecondsAgo,
  });

  const restoreReq = { originalUrl: '/api/v1/users/me/restore' } as Request;
  const adminReq = { originalUrl: '/api/v1/admin/users' } as Request;
  const otherReq = { originalUrl: '/api/v1/wallet/me' } as Request;

  it('deleted user + REGULAR token → 401 (unchanged baseline)', async () => {
    const strategy = makeStrategy(deletedUser);
    await expect(
      strategy.validate(otherReq, { sub: 'u1', phone: '+966500000001', role: 'Player' }),
    ).rejects.toThrow(/scheduled for deletion/);
  });

  it('deleted user + restore token on the restore route (in window) → PASSES with DB role', async () => {
    const strategy = makeStrategy(deletedUser);
    const result = await strategy.validate(restoreReq, restoreToken(10));
    expect(result.sub).toBe('u1');
    expect(result.role).toBe('Player');
  });

  // Run #31 resume hardening: originalUrl carries the query string — the
  // route gate must strip it, not 403 a restore call that carries ?code=…
  it('restore route WITH a query string → still PASSES (gate matches path only)', async () => {
    const strategy = makeStrategy(deletedUser);
    const qsReq = {
      originalUrl: '/api/v1/users/me/restore?code=abc&utm_source=email',
    } as Request;
    const result = await strategy.validate(qsReq, restoreToken(10));
    expect(result.sub).toBe('u1');
  });

  // Malformed percent-encoding must degrade to a 403 route rejection,
  // never an unhandled decode error (500).
  it('malformed percent-encoding in the URL → clean 403 (no decode crash)', async () => {
    const strategy = makeStrategy(deletedUser);
    const badReq = { originalUrl: '/api/v1/wallet/%zz' } as Request;
    await expect(
      strategy.validate(badReq, restoreToken(10)),
    ).rejects.toThrow(/can only restore the account/);
  });

  it('deleted user + restore token on an /admin path → 403 (admin surface closed)', async () => {
    const strategy = makeStrategy(deletedUser);
    await expect(
      strategy.validate(adminReq, restoreToken(10)),
    ).rejects.toThrow(/can only restore the account/);
  });

  it('deleted user + restore token on any other route → 403 (not a session token)', async () => {
    const strategy = makeStrategy(deletedUser);
    await expect(
      strategy.validate(otherReq, restoreToken(10)),
    ).rejects.toThrow(/can only restore the account/);
  });

  it('deleted user + restore token past iat+30d → 403 (window expired, ghost stays dead)', async () => {
    const strategy = makeStrategy(deletedUser);
    await expect(
      strategy.validate(restoreReq, restoreToken(31 * 86_400 + 60)),
    ).rejects.toThrow(/Restore window has expired/);
  });

  // Run #31 resume hardening (Reviewer A IMPORTANT #1): a restore token is
  // NOT a session token. Once restore succeeds (deleted_at NULL), the same
  // JWT used to be accepted on EVERY route until exp — a leaked restore
  // token was a full session on the restored account. Now it 403s.
  it('ACTIVE user + restore token on a normal route → 403 (spent-token replay guard)', async () => {
    const strategy = makeStrategy(activeUser);
    await expect(
      strategy.validate(otherReq, restoreToken(10)),
    ).rejects.toThrow(/already been used/);
  });

  it('ACTIVE user + REGULAR token → unaffected', async () => {
    const strategy = makeStrategy(activeUser);
    const result = await strategy.validate(otherReq, {
      sub: 'u1',
      phone: '+966500000001',
      role: 'Player',
      iat: NOW_S,
    });
    expect(result.role).toBe('Player');
  });

  it('unknown user → 401 Account no longer exists', async () => {
    const strategy = makeStrategy(null);
    await expect(
      strategy.validate(otherReq, { sub: 'ghost', phone: '', role: 'Player' }),
    ).rejects.toThrow(/no longer exists/);
  });
});
