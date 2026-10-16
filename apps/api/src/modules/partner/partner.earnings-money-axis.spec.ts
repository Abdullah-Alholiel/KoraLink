import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PartnerService } from './partner.service';

/**
 * P2-209 regression specs (run #138, Reviewer-A IMPORTANT duo):
 *
 * 1. getDashboard `revenueToday` is keyed to the RIYADH day (AT TIME ZONE
 *    'Asia/Riyadh' + CURRENT_DATE), never the server-UTC `date_trunc` day —
 *    the endpoint's own P2-109 trend already uses the Riyadh axis, so the two
 *    figures must agree about what "today" is (~21:00-24:00 UTC drift window).
 * 2. getEarnings `totalPending`/`totalPaid` aggregate in SQL as
 *    `::numeric(12,2)::text` with a status predicate — never a JS float
 *    reduce over fetched rows (P2-4 money class).
 * 3. Empty branches return string money ('0.00'), not number 0.
 */
process.env.TZ = 'UTC';

const dialect = new PgDialect();

/** Captured WHERE clauses, in execution order. */
type Row = Record<string, unknown>;

/**
 * Universal query-chain stub: every builder method returns an awaitable
 * proxy that resolves to `rows`, so any select shape getDashboard/getEarnings
 * uses resolves without method-specific wiring. `answer` (optional) lets a
 * caller resolve rows from the captured WHERE text at await time.
 */
function chainable(
  rows: Row[],
  wheres: string[],
  whereParams: unknown[][],
  answer?: (whereSql: string, params: unknown[]) => Row[],
): unknown {
  let resolved = rows;
  const build = (): any => {
    const target: any = Promise.resolve([]);
    const proxy: any = new Proxy(target, {
      get(_t, prop: string | symbol) {
        if (prop === 'where') {
          return (cond: SQL | undefined) => {
            if (cond) {
              const q = dialect.sqlToQuery(cond);
              wheres.push(q.sql);
              whereParams.push(q.params as unknown[]);
              if (answer) resolved = answer(q.sql, q.params as unknown[]);
            }
            return proxy;
          };
        }
        if (prop === 'then') {
          return (onFulfilled: (v: Row[]) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(resolved).then(onFulfilled, onRejected);
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };
  return build();
}

function makeService(opts: {
  /** Total returned for the pending-status SUM select. */
  pendingTotal?: string;
  /** Total returned for the paid-status SUM select. */
  paidTotal?: string;
  /** Rows for every other select (dashboard fragments etc.). */
  genericRows?: Row[];
}) {
  const wheres: string[] = [];
  const whereParams: unknown[][] = [];
  const db = {
    execute: async (q: SQL) => {
      const { sql: sqlText } = dialect.sqlToQuery(q);
      if (sqlText.includes('FILTER')) return [{ total: 0, booked: 0 }];
      return [];
    },
    select: () => ({
      from: (table: unknown) => {
        const isSettlements =
          typeof table === 'object' && table !== null && 'amount' in (table as Row);
        if (isSettlements) {
          // Shape-based: SUM selects bind the status as a PARAM ($n), so the
          // pending/paid branch is told apart by the bound params, not text.
          return chainable([], wheres, whereParams, (_whereSql, params) => {
            if (params.includes('pending')) return [{ total: opts.pendingTotal }];
            if (params.includes('paid')) return [{ total: opts.paidTotal }];
            return [];
          });
        }
        return chainable(opts.genericRows ?? [], wheres, whereParams);
      },
    }),
  };
  const svc = new PartnerService(db as never, { broadcastOps: () => {} } as never);
  const scoped = svc as unknown as {
    scopedVenueIds: () => Promise<string[]>;
    scopedPitchIds: () => Promise<string[]>;
  };
  scoped.scopedVenueIds = async () => ['v1'];
  scoped.scopedPitchIds = async () => ['p1'];
  return { svc, wheres, whereParams };
}

describe('P2-209: revenueToday uses the Riyadh-day axis (not server-UTC)', () => {
  it('dashboard revenue predicate carries AT TIME ZONE Asia/Riyadh + CURRENT_DATE', async () => {
    const { svc, wheres } = makeService({ genericRows: [{ total: '1234.50' }] });
    await svc.getDashboard('owner', 'VenueOwner');
    const revenueWhere = wheres.find((w) => w.includes('CURRENT_DATE') && w.includes('scheduled_at'));
    expect(revenueWhere).toBeDefined();
    expect(revenueWhere).toContain('AT TIME ZONE');
    expect(revenueWhere).toContain("'Asia/Riyadh'");
    expect(revenueWhere).toContain('CURRENT_DATE');
    // Regression: the old server-UTC form must never return.
    expect(revenueWhere).not.toContain('date_trunc');
  });

  it('revenueToday returns quantized string money (never a bare number)', async () => {
    const { svc } = makeService({ genericRows: [{ total: '1234.50' }] });
    const res = await svc.getDashboard('owner', 'VenueOwner');
    expect(res.revenueToday).toBe('1234.50');
    expect(typeof res.revenueToday).toBe('string');
  });
});

describe('P2-209: getEarnings totals aggregate in SQL (numeric text, status predicates)', () => {
  it('totalPending/totalPaid come from ::numeric(12,2)::text SUMs with status filters', async () => {
    const { svc, wheres, whereParams } = makeService({ pendingTotal: '500.25', paidTotal: '88.00' });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.totalPending).toBe('500.25');
    expect(res.totalPaid).toBe('88.00');
    expect(typeof res.totalPending).toBe('string');
    expect(typeof res.totalPaid).toBe('string');
    const statusIdx = wheres
      .map((w, i) => (w.includes('"settlements"."status"') ? i : -1))
      .filter((i) => i >= 0);
    expect(statusIdx).toHaveLength(2);
    // The status predicate is a bound param — assert the literal arrives intact
    // and the predicate rides the settlements status column.
    expect(wheres[statusIdx[0]]).toContain('"settlements"."status" = $');
    const flat = whereParams.flat();
    expect(flat).toContain('pending');
    expect(flat).toContain('paid');
  });

  it('missing SUM rows fall back to 0.00 strings', async () => {
    const { svc } = makeService({});
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.totalPending).toBe('0.00');
    expect(res.totalPaid).toBe('0.00');
  });
});
