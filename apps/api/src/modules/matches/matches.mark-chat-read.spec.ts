import { ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';

/**
 * P2-58 (run #50): markChatRead — single guarded UPDATE … RETURNING.
 * Zero rows returned IS the membership miss (Forbidden), ≥1 row means the
 * caller's roster row advanced. The .set() payload must be exactly
 * { last_read_at } — match_players has no updated_at column, so any
 * withTimestamp-style helper would make the UPDATE 500 live (42703).
 */

const MEMBER_UPDATE_RETURN = [{ id: 'mp-1' }];

function makeService(updatedRows: Array<{ id: string }>) {
  const captured: { setArg?: unknown } = {};
  const db = {
    update: () => ({
      set: (arg: unknown) => {
        captured.setArg = arg;
        return {
          where: () => ({
            returning: async () => updatedRows,
          }),
        };
      },
    }),
  };
  // Only markChatRead's path is exercised here; the remaining constructor
  // dependencies are unreachable on this code path, so the constructor is
  // narrowed to its first (DB) parameter.
  const Ctor = MatchesService as unknown as new (db: unknown) => MatchesService;
  const service = new Ctor(db);
  return { service, captured };
}

describe('MatchesService.markChatRead (P2-58)', () => {
  it('returns { ok: true } when the roster row advanced', async () => {
    const { service, captured } = makeService(MEMBER_UPDATE_RETURN);

    await expect(service.markChatRead('u1', 'm1')).resolves.toEqual({ ok: true });

    const setArg = captured.setArg as Record<string, unknown>;
    expect(Object.keys(setArg)).toEqual(['last_read_at']);
    expect(setArg.last_read_at).toBeInstanceOf(Date);
  });

  it('throws Forbidden when the caller is not on the roster (zero rows)', async () => {
    const { service } = makeService([]);

    await expect(service.markChatRead('outsider', 'm1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
