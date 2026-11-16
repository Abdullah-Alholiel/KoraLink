import { AdminDisputesService } from './disputes.service';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * SLA triage surface (run #122): list() exposes per-row SLA math
 * (sla_deadline / sla_hours_left / sla_breached) + a `sla` filter
 * (`escalated` = persisted flag; `breaching` = sweep-window predicate over
 * not-yet-escalated rows). The window mirrors the P1-63 sweep constant
 * (7 days from updated_at), so the queue and the sweep agree on the clock.
 *
 * db.execute is mocked at the SQL level; queries are rendered through
 * drizzle's own PgDialect.sqlToQuery (same pattern as the appeal-filter
 * spec) so the assertions see the exact text + bound params.
 */
describe('AdminDisputesService — SLA triage list (run #122)', () => {
  function makeService() {
    const queries: unknown[] = [];
    const txOpts: unknown[] = [];
    const db = {
      query: { disputes: {}, dispute_messages: {} },
      // Same executor object serves both db.execute and the tx handle: list()
      // routes every statement through the same mock regardless of path.
      execute: jest.fn(async (q: unknown) => {
        queries.push(q);
        const text = new PgDialect().sqlToQuery(q as never).sql;
        // Branch on TOP-LEVEL shape: the count query STARTS with SELECT COUNT —
        // the page query only CONTAINS a COUNT(*) subquery (appeal_count).
        // (PR-Agent r1: an unanchored /COUNT(*)/ test served [{c:0}] to both.)
        return text.trimStart().startsWith('SELECT COUNT(*)') ? [{ c: 0 }] : [];
      }),
      // Run #123: list() wraps page + count in ONE transaction so both read the
      // same snapshot. The mock records the isolation options for the pin below.
      transaction: jest.fn(async (cb: (tx: unknown) => unknown, opts?: unknown) => {
        txOpts.push(opts);
        return cb(db);
      }),
    };
    const svc = new AdminDisputesService(
      db as never,
      { log: jest.fn(async () => {}) } as never,
      { broadcastOps: jest.fn() } as never,
      { record: jest.fn(async () => {}) } as never,
    );
    return { svc, queries, txOpts };
  }

  const render = (q: unknown) => {
    const built = new PgDialect().sqlToQuery(q as never);
    return { sqlText: built.sql, params: built.params as unknown[] };
  };

  it('always projects sla_deadline / sla_hours_left / sla_breached (additive keys)', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20 } as ListDisputesDto);
    const { sqlText } = render(queries[0]);
    expect(sqlText).toContain('AS sla_deadline');
    expect(sqlText).toContain('AS sla_hours_left');
    expect(sqlText).toContain('AS sla_breached');
    // legacy projection keys untouched
    expect(sqlText).toContain('d.sla_escalated');
    expect(sqlText).toContain('AS appeal_count');
  });

  it('sla_hours_left is numeric (::float8), never a string', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20 } as ListDisputesDto);
    const { sqlText } = render(queries[0]);
    expect(sqlText).toMatch(/\/ 3600\.0, 1\)::float8/);
  });

  it('sla=escalated filter applies to BOTH queries; page and count are distinguished by shape', async () => {
    const { svc, queries, txOpts } = makeService();
    const result = await svc.list({ page: 1, perPage: 20, sla: 'escalated' } as ListDisputesDto);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(render(q).sqlText).toContain('d.sla_escalated = true');
    }
    // Run #123: page + count share ONE transaction (repeatable read) so a
    // concurrent sweep write cannot flip `total` vs the returned page.
    expect(txOpts).toEqual([{ isolationLevel: 'repeatable read' }]);
    // page query got [] (no COUNT prefix) → mapped disputes; count got [{c:0}]
    expect(result).toEqual({ disputes: [], total: 0, page: 1, perPage: 20 });
  });

  it('sla=breaching mirrors the sweep predicate: undecided + aged + NOT yet escalated', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20, sla: 'breaching' } as ListDisputesDto);
    const { sqlText } = render(queries[0]);
    expect(sqlText).toMatch(/d\.status = 'opened' OR d\.status = 'under_review'/);
    expect(sqlText).toContain('d.sla_escalated = false');
    expect(sqlText).toContain("interval '1 millisecond' < now()");
  });

  it('breaching window is parametrized from the sweep constant (7 days = 604800000 ms)', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20, sla: 'breaching' } as ListDisputesDto);
    const { params } = render(queries[0]);
    expect(params).toContain(604800000);
  });

  it('open disputes sort by least SLA time first; appeal is only a tiebreaker now', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20 } as ListDisputesDto);
    const { sqlText } = render(queries[0]);
    const order = sqlText.slice(sqlText.indexOf('ORDER BY'));
    const undecided = order.indexOf("(d.status IN ('opened','under_review')) DESC");
    const hoursAsc = order.indexOf('END ASC NULLS LAST');
    const appealTail = order.lastIndexOf("e->>'action' = 'appeal'");
    expect(undecided).toBeGreaterThan(-1);
    expect(hoursAsc).toBeGreaterThan(undecided);
    expect(appealTail).toBeGreaterThan(hoursAsc);
  });

  it('deadline math keys on updated_at (the sweep clock), guarded for NULL', async () => {
    const { svc, queries } = makeService();
    await svc.list({ page: 1, perPage: 20 } as ListDisputesDto);
    const { sqlText } = render(queries[0]);
    expect(sqlText).toContain('d.updated_at IS NOT NULL');
    // window derives from updated_at in all three projections
    expect(sqlText.match(/d\.updated_at \+/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sqlText).not.toContain('d.created_at +');
  });
});
