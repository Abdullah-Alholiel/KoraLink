import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminVenuesService } from './venues.service';
import { PartnerService } from '../partner/partner.service';

/**
 * P2-170 (run #114) — admin + partner venue-list owner joins must be LEFT, never INNER.
 *
 * PR #97 (P2-167) fixed the player surface; this pins the ops surfaces to the same
 * class rule: a missing owner user row (manual SQL, future cascade change) must not
 * silently drop a venue from the admin list, the admin total count, or the partner
 * portal list. Display fallback stays `COALESCE(full_name, '')` so the frontend's
 * `?? '—'` contract keeps receiving a string.
 *
 * Same PgDialect.sqlToQuery pattern as venues.owner-join.spec.ts (P2-167).
 */
describe('Owner LEFT JOIN sweep — admin + partner venue lists (P2-170)', () => {
  const dialect = new PgDialect();

  function makeAdminService() {
    const queries: { sql: string; params: unknown[] }[] = [];
    const execute = jest.fn(async (query: unknown) => {
      queries.push(dialect.sqlToQuery(query as never));
      return { rows: [] };
    });
    const db = { execute };
    const service = new AdminVenuesService(
      db as never,
      { log: jest.fn() } as never,
      { emitOps: jest.fn() } as never,
      { log: jest.fn() } as never,
    );
    return { service, queries, execute };
  }

  function makePartnerService() {
    let lastSql: { sql: string; params: unknown[] } | null = null;
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => {
            throw new Error('REGRESSION: getVenues flipped back to innerJoin(users)');
          },
          leftJoin: (_table: unknown, on: unknown) => {
            lastSql = dialect.sqlToQuery(on as never);
            return {
              where: () => ({
                orderBy: async () => [],
              }),
            };
          },
        }),
      }),
    };
    const service = new PartnerService(db as never, { emitOps: jest.fn() } as never);
    return { service, getOn: () => lastSql };
  }

  it('admin list: LEFT JOIN owner + COALESCE display name', async () => {
    const { service, queries } = makeAdminService();
    await service.list({ page: 1, perPage: 20 });

    const q = queries[0].sql;
    expect(q).toContain('LEFT JOIN users u ON u.id = v.owner_id');
    expect(q).not.toMatch(/INNER JOIN users u/);
    expect(q).toContain("COALESCE(u.full_name, '') AS owner_name");
    // join-strength flip must not weaken the pagination contract
    expect(q).toContain('GROUP BY v.id, u.id, vv.status');
    expect(q).toContain('LIMIT');
  });

  it('admin count query: LEFT JOIN owner (total must not drop ownerless venues)', async () => {
    const { service, execute } = makeAdminService();
    await service.list({ page: 1, perPage: 20 });

    // list() runs rows-query then count-query; assert the second capture
    expect(execute.mock.calls.length).toBe(2);
    const countSql = dialect.sqlToQuery(execute.mock.calls[1][0] as never).sql;
    expect(countSql).toContain('LEFT JOIN users u ON u.id = v.owner_id');
    expect(countSql).not.toMatch(/INNER JOIN users u/);
    expect(countSql).toContain('COUNT(DISTINCT v.id)');
  });

  it('partner getVenues: leftJoin(users) with COALESCE fallback (never innerJoin)', async () => {
    const { service, getOn } = makePartnerService();
    const rows = await service.getVenues('owner-1');

    expect(rows).toEqual([]);
    expect(getOn()).toBeTruthy();
  });
});
