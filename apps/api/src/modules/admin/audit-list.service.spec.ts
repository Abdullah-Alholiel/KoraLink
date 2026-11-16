import { AdminAuditListService } from './audit-list.service';

/**
 * P2-318 behavior coverage (PR-Agent r2 MINOR on PR #224: the source-contract
 * tripwire asserts text, it never RUNS the service). These cases execute the
 * real AdminAuditListService against a scripted fake DB:
 *  - populated page: total comes from the window-count column, rows are
 *    returned WITHOUT the helper column, exactly ONE query executes.
 *  - empty page (beyond-range / concurrently-emptied last page): the guarded
 *    exact-COUNT fallback fires as the SECOND query and total stays truthful
 *    — never 0 (the r1 regression PR-Agent caught).
 */

type Row = Record<string, unknown>;

function makeDb(pages: Row[][]) {
  const queries: string[] = [];
  let call = 0;
  const db = {
    execute: async (q: unknown) => {
      queries.push(String(q));
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return page;
    },
  };
  return { db, queries };
}

const service = (db: unknown) =>
  new AdminAuditListService(db as never);

const populatedRow = {
  id: 'log-1',
  admin_id: 'admin-1',
  action: 'venue.hide',
  entity_type: 'venue',
  entity_id: 'venue-1',
  before: null,
  after: { hidden: true },
  ip: '10.0.0.1',
  created_at: '2026-11-07T10:00:00Z',
  admin_name: 'HQ Admin',
  total_count: 7,
};

describe('AdminAuditListService pagination behavior (P2-318)', () => {
  it('populated page: total from the window count, helper column stripped, ONE query', async () => {
    const { db, queries } = makeDb([[populatedRow]]);
    const res = await service(db).list({ page: 1, perPage: 50 });
    expect(res.logs).toHaveLength(1);
    expect(res.logs[0]).toEqual({ ...populatedRow, total_count: undefined });
    expect('total_count' in res.logs[0]).toBe(false);
    expect(res.total).toBe(7);
    expect(res.page).toBe(1);
    expect(res.perPage).toBe(50);
    // Single-query contract on populated pages (SQL text shape is pinned by
    // the audit-list.pagination.spec.ts source tripwire — drizzle SQL objects
    // do not stringify here).
    expect(queries).toHaveLength(1);
  });

  it('empty page: exact-COUNT fallback fires as the SECOND query and total stays truthful (never 0)', async () => {
    const { db, queries } = makeDb([[], [{ c: 42 }]]);
    const res = await service(db).list({ page: 9, perPage: 50 });
    expect(res.logs).toEqual([]);
    expect(res.total).toBe(42);
    expect(queries).toHaveLength(2);
  });

  it('filter conditions compose into the fallback too (entityType page keeps its filtered total)', async () => {
    const { db, queries } = makeDb([[], [{ c: 3 }]]);
    const res = await service(db).list({ entityType: 'venue', page: 2, perPage: 50 });
    expect(res.total).toBe(3);
    expect(queries).toHaveLength(2);
  });
});
