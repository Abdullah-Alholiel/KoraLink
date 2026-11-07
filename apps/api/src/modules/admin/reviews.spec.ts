import { NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminReviewsService } from './reviews.service';

/**
 * P2-291: admin venue-review moderation. Pins the guarded WHERE predicates
 * (removing one re-opens duplicate audit rows on a repeated call), the 404 and
 * idempotent 0-row outcomes, audit-in-the-same-tx, and the list filters.
 */
describe('AdminReviewsService (P2-291)', () => {
  const dialect = new PgDialect();
  const toSql = (clause: unknown) => dialect.sqlToQuery(clause as never);

  const ID = 'r-1';
  const row = {
    id: ID,
    venue_id: 'v-1',
    user_id: 'u-1',
    rating: 2,
    comment: 'spam',
    hidden_at: new Date('2026-10-31T00:00:00Z') as Date | null,
    updated_at: new Date('2026-10-31T00:00:00Z'),
  };

  interface Opts {
    /** RETURNING rows of the guarded UPDATE. */
    updated?: unknown[];
    /** Rows of the 0-row re-read. */
    current?: unknown[];
    /** RETURNING rows of the DELETE. */
    deleted?: unknown[];
    /** Results of db.execute, in call order. */
    executes?: unknown[][];
  }

  function makeService(opts: Opts) {
    const updateWhere: string[] = [];
    const setPayloads: Array<Record<string, unknown>> = [];
    const executed: Array<{ sql: string; params: unknown[] }> = [];
    const executes = [...(opts.executes ?? [])];

    const tx = {
      update: () => ({
        set: (payload: Record<string, unknown>) => {
          setPayloads.push(payload);
          return {
            where: (clause: unknown) => {
              updateWhere.push(toSql(clause).sql.toLowerCase());
              return { returning: async () => opts.updated ?? [] };
            },
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => opts.current ?? [] }),
        }),
      }),
      delete: () => ({
        where: () => ({ returning: async () => opts.deleted ?? [] }),
      }),
    };
    const db = {
      transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      execute: jest.fn(async (query: unknown) => {
        const { sql, params } = toSql(query);
        executed.push({ sql, params });
        return executes.shift() ?? [];
      }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminReviewsService(db as never, audit as never);
    return { service, audit, tx, updateWhere, setPayloads, executed };
  }

  describe('hide', () => {
    it('guards on hidden_at IS NULL, stamps hidden_at + updated_at, audits in the same tx', async () => {
      const { service, audit, tx, updateWhere, setPayloads } = makeService({ updated: [row] });

      await expect(service.hide(ID, 'admin-1', '10.0.0.1')).resolves.toEqual(row);

      expect(updateWhere[0]).toContain('"venue_reviews"."id" = $1');
      expect(updateWhere[0]).toContain('"venue_reviews"."hidden_at" is null');
      expect(toSql(setPayloads[0].hidden_at).sql).toBe('now()');
      expect(setPayloads[0].updated_at).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'venue_review.hide',
          entityType: 'venue_review',
          entityId: ID,
          ip: '10.0.0.1',
        }),
        tx,
      );
    });

    it('second hide is idempotent: returns the current row, no duplicate audit', async () => {
      const { service, audit } = makeService({ updated: [], current: [row] });

      await expect(service.hide(ID, 'admin-1')).resolves.toEqual(row);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('404s on a missing id, no audit', async () => {
      const { service, audit } = makeService({ updated: [], current: [] });

      await expect(service.hide(ID, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    const restored = { ...row, hidden_at: null };

    it('guards on hidden_at IS NOT NULL, clears hidden_at, audits in the same tx', async () => {
      const { service, audit, tx, updateWhere, setPayloads } = makeService({ updated: [restored] });

      await expect(service.restore(ID, 'admin-1')).resolves.toEqual(restored);

      expect(updateWhere[0]).toContain('"venue_reviews"."hidden_at" is not null');
      expect(setPayloads[0].hidden_at).toBeNull();
      expect(setPayloads[0].updated_at).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'venue_review.restore', entityId: ID }),
        tx,
      );
    });

    it('second restore is idempotent: returns the current row, no duplicate audit', async () => {
      const { service, audit } = makeService({ updated: [], current: [restored] });

      await expect(service.restore(ID, 'admin-1')).resolves.toEqual(restored);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('404s on a missing id, no audit', async () => {
      const { service, audit } = makeService({ updated: [], current: [] });

      await expect(service.restore(ID, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('returns the deleted row and audits the before snapshot in the same tx', async () => {
      const { service, audit, tx } = makeService({ deleted: [row] });

      await expect(service.remove(ID, 'admin-1')).resolves.toEqual(row);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'venue_review.delete',
          entityId: ID,
          before: { rating: 2, comment: 'spam', venue_id: 'v-1', user_id: 'u-1' },
        }),
        tx,
      );
    });

    it('404s on a missing id, no audit', async () => {
      const { service, audit } = makeService({ deleted: [] });

      await expect(service.remove(ID, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const item = { id: ID, rating: '2', venue_name: 'Arena', author_name: 'Sam' };

    it('joins venue + author, orders by updated_at DESC, paginates, coerces rating', async () => {
      const { service, executed } = makeService({ executes: [[item], [{ c: 41 }]] });

      const out = await service.list({ page: 3, perPage: 25 });

      expect(out).toEqual({
        reviews: [{ ...item, rating: 2 }],
        total: 41,
        page: 3,
        perPage: 25,
      });
      expect(executed[0].sql).toContain('INNER JOIN venues v');
      expect(executed[0].sql).toContain('LEFT JOIN users u');
      expect(executed[0].sql).toContain('ORDER BY vr.updated_at DESC');
      expect(executed[0].sql).not.toContain('WHERE');
      expect(executed[0].params).toEqual([25, 50]);
    });

    it('applies venueId + hidden filters to the page AND the count', async () => {
      const { service, executed } = makeService({ executes: [[], [{ c: 0 }]] });

      await service.list({ page: 1, perPage: 25, venueId: 'v-1', hidden: 'true' });

      for (const q of executed) {
        expect(q.sql).toContain('vr.venue_id = $1');
        expect(q.sql).toContain('vr.hidden_at IS NOT NULL');
        expect(q.params[0]).toBe('v-1');
      }
    });

    it('hidden=false filters to visible rows only', async () => {
      const { service, executed } = makeService({ executes: [[], [{ c: 0 }]] });

      await service.list({ page: 1, perPage: 25, hidden: 'false' });

      expect(executed[0].sql).toContain('WHERE vr.hidden_at IS NULL');
    });
  });
});
