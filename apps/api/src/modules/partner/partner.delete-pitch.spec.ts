import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PartnerService } from './partner.service';
import { matches, pitches } from '../../database/schema';

/**
 * deletePitch TOCTOU regression specs (P2-105).
 *
 * matches.pitch_id is ON DELETE CASCADE, so before the fix a match created
 * between the history count and the DELETE was silently cascade-erased. Now
 * the pitch row is locked FOR UPDATE inside one tx before the count, and the
 * DELETE runs in that same tx.
 *
 * P2-120: for non-Admins the locked select and the DELETE also carry the
 * venue-owner subquery, so an ownership transfer that commits after the
 * assertPitchAccess pre-check reads as a 404 instead of a stale-auth delete.
 * The stub renders each captured WHERE and, when `currentOwner` is set, only
 * returns the pitch row if an owner-scoped predicate binds that owner.
 */

const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as SQL);

function thenable(rows: unknown[] = []) {
  return { then: (resolve: (v: unknown) => void) => resolve(rows) };
}

function makeService(opts: {
  pitchRow: unknown | null;
  matchCount: number;
  /** Venue owner as committed in the DB when the tx runs. */
  currentOwner?: string;
  /** Rows the tx DELETE should "return" (defaults to the pitch when present). */
  deleteRows?: unknown[];
}) {
  const calls: string[] = [];
  const wheres: { select?: unknown; delete?: unknown } = {};
  /** Rows the tx DELETE "returns" — empty simulates a mid-flight scope miss. */
  const deleteRows: unknown[] = opts.deleteRows ?? (opts.pitchRow ? [{ id: 'pitch-1' }] : []);
  const visible = (where: unknown) => {
    if (!opts.pitchRow) return false;
    const q = render(where);
    if (!q.sql.includes('owner_id') || opts.currentOwner === undefined) return true;
    return q.params.includes(opts.currentOwner);
  };
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (where: unknown) => {
          if (table === pitches) {
            wheres.select = where;
            return {
              limit: () => ({
                for: (mode: string) => {
                  calls.push(`select-pitch-for-${mode}`);
                  return thenable(visible(where) ? [opts.pitchRow] : []);
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
      where: (where: unknown) => {
        if (table === pitches) wheres.delete = where;
        calls.push(table === pitches ? 'tx-delete-pitch' : 'tx-delete-other');
        return thenable(deleteRows);
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
  return { svc, calls, broadcastOps, wheres };
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

  describe('owner scope inside the tx (P2-120)', () => {
    const OWNER = 'owner-1';
    const NEW_OWNER = 'owner-2';

    it('non-Admin owner: locked select and DELETE both carry the venue-owner subquery', async () => {
      const { svc, wheres } = makeService({ pitchRow: PITCH, matchCount: 0, currentOwner: OWNER });
      await expect(svc.deletePitch(OWNER, 'VenueOwner', 'pitch-1')).resolves.toEqual({
        deleted: true,
      });
      for (const where of [wheres.select, wheres.delete]) {
        const q = render(where);
        expect(q.sql).toContain('IN (SELECT id FROM venues WHERE owner_id =');
        expect(q.sql).not.toContain('::uuid');
        expect(q.params).toEqual(expect.arrayContaining(['pitch-1', OWNER]));
      }
    });

    it('non-Admin: ownership transferred after the pre-check 404s from the tx select', async () => {
      // assertPitchAccess (stubbed) passed on the stale ownership; the venue
      // now belongs to NEW_OWNER when the tx runs.
      const { svc, calls, broadcastOps } = makeService({
        pitchRow: PITCH,
        matchCount: 0,
        currentOwner: NEW_OWNER,
      });
      await expect(svc.deletePitch(OWNER, 'VenueOwner', 'pitch-1')).rejects.toThrow(
        new NotFoundException('Pitch not found.'),
      );
      expect(calls).toContain('select-pitch-for-update');
      expect(calls).not.toContain('count-matches');
      expect(calls).not.toContain('tx-delete-pitch');
      expect(broadcastOps).not.toHaveBeenCalled();
    });

    it('non-Admin non-owner: rejects NotFound without deleting', async () => {
      const { svc, calls, broadcastOps } = makeService({
        pitchRow: PITCH,
        matchCount: 0,
        currentOwner: OWNER,
      });
      await expect(svc.deletePitch('stranger', 'VenueOwner', 'pitch-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(calls).not.toContain('tx-delete-pitch');
      expect(broadcastOps).not.toHaveBeenCalled();
    });

    it('Admin: select and DELETE keep id-only scoping', async () => {
      const { svc, wheres } = makeService({ pitchRow: PITCH, matchCount: 0, currentOwner: OWNER });
      await expect(svc.deletePitch('admin-1', 'Admin', 'pitch-1')).resolves.toEqual({
        deleted: true,
      });
      for (const where of [wheres.select, wheres.delete]) {
        const q = render(where);
        expect(q.sql).not.toContain('owner_id');
        expect(q.params).toEqual(['pitch-1']);
      }
    });

    it('non-Admin owner: a pitch with match history still 400s with the count', async () => {
      const { svc, calls } = makeService({ pitchRow: PITCH, matchCount: 2, currentOwner: OWNER });
      const err = await svc.deletePitch(OWNER, 'VenueOwner', 'pitch-1').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toBe(
        'This pitch has 2 match(es) in its history and cannot be deleted — set it unavailable instead.',
      );
      expect(calls).not.toContain('tx-delete-pitch');
    });

    it('P2-120 hardening: DELETE matching 0 rows (mid-flight transfer) 404s instead of {deleted:true}', async () => {
      // SELECT (old-owner snapshot) succeeds, but the DELETE statement's fresh
      // READ COMMITTED snapshot misses the row — affected-row guard must fire.
      const { svc, calls, broadcastOps } = makeService({
        pitchRow: PITCH,
        matchCount: 0,
        currentOwner: OWNER,
        deleteRows: [],
      });
      await expect(svc.deletePitch(OWNER, 'VenueOwner', 'pitch-1')).rejects.toThrow(
        new NotFoundException('Pitch not found.'),
      );
      expect(calls).toContain('tx-delete-pitch');
      expect(broadcastOps).not.toHaveBeenCalled();
    });
  });
});
