/**
 * P2-250 (run #160, Reviewer A #159): the admin settlements list must surface
 * payout-request PROVENANCE — requested_by + requested_by_name via LEFT JOIN
 * users — so admins can distinguish partner-requested rows from
 * auto-generated ones. NULL requested_by (auto-generated / pre-0053 rows)
 * must keep its row (LEFT JOIN, never INNER).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminSettlementsService } from './settlements.service';

function render(q: unknown): { sqlText: string; params: unknown[] } {
  const built = new PgDialect().sqlToQuery(q as never);
  return { sqlText: built.sql, params: built.params as unknown[] };
}

describe('AdminSettlementsService.list — provenance read-model (P2-250)', () => {
  function makeService() {
    const queries: unknown[] = [];
    const db = {
      query: { settlements: { findFirst: jest.fn() } },
      update: jest.fn(),
      execute: jest.fn(async (q: unknown) => {
        queries.push(q);
        return [];
      }),
      transaction: jest.fn(),
      insert: jest.fn(),
    };
    const svc = new AdminSettlementsService(
      db as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      { broadcastOps: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, queries };
  }

  it('page SELECT carries requested_by + LEFT JOIN users (provenance)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);

    expect(queries.length).toBe(2); // page + count
    const page = render(queries[0]);
    expect(page.sqlText).toContain('s.requested_by');
    expect(page.sqlText).toContain('u.full_name AS requested_by_name');
    expect(page.sqlText).toContain('LEFT JOIN users u ON u.id = s.requested_by');
    // Count query stays a plain aggregate — no join needed for provenance.
    const count = render(queries[1]);
    expect(count.sqlText).not.toContain('LEFT JOIN');
  });

  it('LEFT JOIN never drops auto-generated rows (requested_by NULL)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);
    const page = render(queries[0]);
    // The only users join must be LEFT — an INNER join would hide the
    // auto-generated (NULL requested_by) settlements from admins.
    expect(page.sqlText.match(/JOIN users/g)).toHaveLength(1);
    expect(page.sqlText).toContain('LEFT JOIN users');
    expect(page.sqlText).not.toContain('INNER JOIN users');
  });

  it('no ::uuid casts — all id params stay varchar(36) (standing tripwire)', async () => {
    const { svc, queries } = makeService();
    await svc.list({} as never);
    for (const q of queries) {
      const { sqlText } = render(q);
      expect(sqlText).not.toContain('::uuid');
    }
  });
});
