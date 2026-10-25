/**
 * P2-216/P2-209 (run #163): the getDashboard "today" axis is Riyadh, computed
 * in JS (riyadhDateString param) — never bare CURRENT_DATE, whose meaning
 * follows the Postgres server's timezone (the drift class PR #141's purged
 * regression spec pinned for revenueToday; re-created here against the new
 * implementation). Also pins the admin pitches slot-count subqueries.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PartnerService } from './partner.service';
import { AdminPitchesService } from '../../modules/admin/pitches.service';

const dialect = new PgDialect();

describe('dashboard + admin pitches: Riyadh today axis (P2-216, PR #141 residue)', () => {
  function makePartnerDb() {
    const rendered: { sql: string; params: unknown[] }[] = [];
    let selectCalls = 0;
    const db = {
      select: () => {
        // Capture each query's WHERE predicate (an SQL object) at chain time
        // and render it via PgDialect — getDashboard's queries ride drizzle
        // select() (materialized at await), not db.execute.
        const callIndex = ++selectCalls;
        const chain: any = {};
        chain.from = () => chain;
        chain.where = (cond: unknown) => {
          if (cond && typeof cond === 'object') {
            const { sql, params } = dialect.sqlToQuery(cond as never);
            rendered.push({ sql, params });
          }
          return chain;
        };
        chain.orderBy = () => chain;
        chain.leftJoin = () => chain;
        chain.innerJoin = () => chain;
        chain.groupBy = () => chain;
        chain.limit = () => chain;
        chain.then = (
          onFulfilled: (v: unknown) => void,
          onRejected?: (e: unknown) => void,
        ) => {
          // First select = owned venues (must be non-empty or getDashboard
          // early-returns). Later selects resolve aggregate-shaped empties
          // (destructured [util]/[upcoming]/[revenue]/[next] need an object —
          // every later query destructures an array, so row-arrays stay []).
          let payload: unknown = [];
          // getDashboard select order: 1=owned, 2=util([booked,total]),
          // 3=upcoming([c]), 4=revenue([total]), 5=next([mins]),
          // 6=scheduleToday(rows), 7=recentDeposits(rows).
          if (callIndex === 1) payload = [{ id: 'v1', name: 'Riyadh Arena' }];
          if (callIndex === 2) payload = [{ booked: 0, total: 0 }];
          if (callIndex === 3) payload = [{ c: 0 }];
          if (callIndex === 4) payload = [{ total: '0' }];
          if (callIndex === 5) payload = [{ mins: null }];
          return Promise.resolve(payload).then(onFulfilled, onRejected);
        };
        chain.catch = (onRejected: (e: unknown) => void) =>
          Promise.resolve([]).catch(onRejected);
        return chain;
      },
      execute: async (q: SQL) => {
        const { sql, params } = dialect.sqlToQuery(q);
        rendered.push({ sql, params });
        return [];
      },
    };
    return { db: db as never, rendered };
  }

  it('revenueToday + utilization + scheduleToday carry the Riyadh day param and NO bare CURRENT_DATE', async () => {
    const { db, rendered } = makePartnerDb();
    const svc = new PartnerService(db, { broadcastOps: () => {} } as never);
    (svc as unknown as { scopedVenueIds: () => Promise<string[]> }).scopedVenueIds =
      async () => ['v1'];
    (svc as unknown as { scopedPitchIds: () => Promise<string[]> }).scopedPitchIds =
      async () => ['p1'];

    await svc.getDashboard('owner-1', 'VenueOwner');

    expect(rendered.length).toBeGreaterThanOrEqual(3); // util + revenue + schedule
    for (const q of rendered) {
      expect(q.sql).not.toContain('CURRENT_DATE');
    }
    // Utilization + scheduleToday compare slot_date to the bound Riyadh day
    // (the weekly-trend groupBy render also mentions slot_date — all three
    // must be param-driven, none bare CURRENT_DATE).
    const slotQueries = rendered.filter((q) => q.sql.includes('slot_date'));
    expect(slotQueries.length).toBeGreaterThanOrEqual(2);
    for (const q of slotQueries) {
      expect(q.sql).toContain('::date');
      const todayParam = q.params.find(
        (p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p),
      );
      expect(todayParam).toBeDefined();
    }
    // revenueToday: both bounds are timestamptz built from date params via
    // the repo idiom (the UPCOMING_STATUSES fragment also carries a Riyadh
    // TZ reference — assert ≥2 and no session-timezone-dependent compare).
    const revenueQ = rendered.find((q) => q.sql.includes('pitch_cost_sar'));
    expect(revenueQ).toBeDefined();
    expect((revenueQ!.sql.match(/AT TIME ZONE 'Asia\/Riyadh'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(revenueQ!.sql).not.toContain('date_trunc');
    expect(revenueQ!.sql).not.toContain('CURRENT_DATE');
  });

  it('admin pitches list counts upcoming slots from the bound Riyadh day, no CURRENT_DATE', async () => {
    const rendered: { sql: string; params: unknown[] }[] = [];
    const db = {
      execute: async (q: SQL) => {
        const { sql, params } = dialect.sqlToQuery(q);
        rendered.push({ sql, params });
        return [];
      },
    } as never;
    const svc = new AdminPitchesService(
      db,
      { log: jest.fn(async () => {}) } as never,
      { broadcastOps: jest.fn() } as never,
      { scopedVenueIds: async () => [] } as never,
    );
    await svc.list({} as never);

    const listQ = rendered.find((q) => q.sql.includes('slots_total'));
    expect(listQ).toBeDefined();
    expect(listQ!.sql).not.toContain('CURRENT_DATE');
    expect(listQ!.sql).toContain('slot_date >=');
    const todayParam = listQ!.params.find(
      (p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p),
    );
    expect(todayParam).toBeDefined();
  });
});
