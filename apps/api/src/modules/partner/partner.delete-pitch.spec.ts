import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { matches, pitches } from '../../database/schema';

/**
 * deletePitch TOCTOU regression specs (P2-105).
 *
 * matches.pitch_id is ON DELETE CASCADE, so before the fix a match created
 * between the history count and the DELETE was silently cascade-erased. Now
 * the pitch row is locked FOR UPDATE inside one tx before the count, and the
 * DELETE runs in that same tx.
 */

function thenable(rows: unknown[] = []) {
  return { then: (resolve: (v: unknown) => void) => resolve(rows) };
}

function makeService(opts: { pitchRow: unknown | null; matchCount: number }) {
  const calls: string[] = [];
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === pitches) {
            return {
              limit: () => ({
                for: (mode: string) => {
                  calls.push(`select-pitch-for-${mode}`);
                  return thenable(opts.pitchRow ? [opts.pitchRow] : []);
                },
              }),
            };
          }
          if (table === matches) {
            calls.push('count-matches');
            return thenable([{ count: opts.matchCount }]);
          }
          throw new Error('unexpected table');
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        calls.push(table === pitches ? 'tx-delete-pitch' : 'tx-delete-other');
        return thenable([]);
      },
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      calls.push('tx-begin');
      const out = await fn(tx);
      calls.push('tx-commit');
      return out;
    },
    select: () => {
      throw new Error('deletePitch must not read outside the transaction');
    },
    delete: () => {
      throw new Error('deletePitch must not delete outside the transaction');
    },
  };
  const broadcastOps = jest.fn((scope: string) => {
    calls.push(`broadcast-${scope}`);
  });
  const svc = new PartnerService(db as never, { broadcastOps } as never);
  // assertPitchAccess is an internal method — stub it on the instance.
  (svc as unknown as { assertPitchAccess: () => Promise<void> }).assertPitchAccess =
    async () => {
      calls.push('assert-access');
    };
  return { svc, calls, broadcastOps };
}

const PITCH = { id: 'pitch-1' };

describe('PartnerService.deletePitch TOCTOU guard', () => {
  it('404s when the locked pitch select returns no row', async () => {
    const { svc, calls, broadcastOps } = makeService({ pitchRow: null, matchCount: 0 });
    await expect(svc.deletePitch('actor', 'VenueOwner', 'pitch-x')).rejects.toThrow(
      new NotFoundException('Pitch not found.'),
    );
    expect(calls).not.toContain('count-matches');
    expect(calls).not.toContain('tx-delete-pitch');
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('400s with the history message when the pitch has matches', async () => {
    const { svc, calls, broadcastOps } = makeService({ pitchRow: PITCH, matchCount: 3 });
    const err = await svc.deletePitch('actor', 'VenueOwner', 'pitch-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(
      'This pitch has 3 match(es) in its history and cannot be deleted — set it unavailable instead.',
    );
    expect(calls).not.toContain('tx-delete-pitch');
    expect(broadcastOps).not.toHaveBeenCalled();
  });

  it('deletes a pitch with no history and broadcasts once (happy path)', async () => {
    const { svc, broadcastOps } = makeService({ pitchRow: PITCH, matchCount: 0 });
    await expect(svc.deletePitch('actor', 'VenueOwner', 'pitch-1')).resolves.toEqual({
      deleted: true,
    });
    expect(broadcastOps).toHaveBeenCalledTimes(1);
    expect(broadcastOps).toHaveBeenCalledWith('venues');
  });

  it('locks the pitch FOR UPDATE inside the tx before counting, deletes in the same tx, broadcasts after commit', async () => {
    const { svc, calls } = makeService({ pitchRow: PITCH, matchCount: 0 });
    await svc.deletePitch('actor', 'VenueOwner', 'pitch-1');
    expect(calls).toEqual([
      'assert-access',
      'tx-begin',
      'select-pitch-for-update',
      'count-matches',
      'tx-delete-pitch',
      'tx-commit',
      'broadcast-venues',
    ]);
  });
});
