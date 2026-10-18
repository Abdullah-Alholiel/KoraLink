import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PartnerService, riyadhTrendWeeks } from './partner.service';

/**
 * P1-65 regression specs: GET /partner/earnings revenue read-model —
 * perVenue breakdown, 4-week Riyadh trend, slot utilization.
 *
 * 2026-10-10T22:00:00Z = 2026-10-11 01:00 Riyadh, so Riyadh-today is
 * 2026-10-11 and the 28-day window is 2026-09-14 … 2026-10-11.
 */
process.env.TZ = 'UTC';
const NOW = new Date('2026-10-10T22:00:00Z');
const WEEKS = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];

const dialect = new PgDialect();

type VenueRow = { venueId: string; venueName: string; bookedCount: number; revenue: string };
type WeekRow = { weekIndex: number; bookedCount: number; revenue: string };

interface Fixture {
  venueIds: string[];
  pitchIds: string[];
  /** Every venue row in the "database" — the SQL scope must filter these. */
  venueRows?: VenueRow[];
  weekRows?: WeekRow[];
  slots?: { total: number; booked: number };
}

function makeService(fx: Fixture) {
  const executed: { sql: string; params: unknown[] }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          // P2-C (run #143): getEarnings LEFT JOINs users for payout-request
          // provenance; the chain passes through, rows resolve at where().
          leftJoin: () => ({
            where: () => ({ orderBy: async () => [] }),
          }),
          where: () => ({ orderBy: async () => [] }),
        }),
      }),
    }),
    execute: async (q: SQL) => {
      const { sql, params } = dialect.sqlToQuery(q);
      executed.push({ sql, params });
      if (sql.includes('"venueId"')) {
        // Emulate the venue scope + ORDER BY revenue DESC the SQL performs.
        return (fx.venueRows ?? [])
          .filter((r) => params.includes(r.venueId))
          .sort((a, b) => Number(b.revenue) - Number(a.revenue));
      }
      if (sql.includes('"weekIndex"')) return fx.weekRows ?? [];
      if (sql.includes('FILTER')) return [fx.slots ?? { total: 0, booked: 0 }];
      throw new Error(`unexpected execute: ${sql}`);
    },
  };
  const svc = new PartnerService(db as never, { broadcastOps: () => {} } as never);
  const scoped = svc as unknown as {
    scopedVenueIds: () => Promise<string[]>;
    scopedPitchIds: () => Promise<string[]>;
  };
  scoped.scopedVenueIds = async () => fx.venueIds;
  scoped.scopedPitchIds = async () => fx.pitchIds;
  return { svc, executed };
}

describe('riyadhTrendWeeks (P1-65)', () => {
  it('4 weekly starts, oldest first, last week ends Riyadh-today', () => {
    expect(riyadhTrendWeeks(NOW.getTime())).toEqual(WEEKS);
  });
});

describe('PartnerService.getEarnings revenue view (P1-65)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('empty branch (no venues) still carries every field', async () => {
    const { svc, executed } = makeService({ venueIds: [], pitchIds: [] });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res).toEqual({
      settlements: [],
      totalPending: 0,
      totalPaid: 0,
      perVenue: [],
      fourWeekTrend: WEEKS.map((weekStart) => ({ weekStart, revenue: '0.00', bookedCount: 0 })),
      utilizationPct: 0,
    });
    expect(executed).toHaveLength(0);
  });

  it('trend is always 4 zero-filled Riyadh weeks (no holes)', async () => {
    const { svc } = makeService({
      venueIds: ['v1'],
      pitchIds: ['p1'],
      weekRows: [{ weekIndex: 1, bookedCount: 3, revenue: '450.00' }],
    });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.fourWeekTrend).toEqual([
      { weekStart: '2026-09-14', revenue: '0.00', bookedCount: 0 },
      { weekStart: '2026-09-21', revenue: '450.00', bookedCount: 3 },
      { weekStart: '2026-09-28', revenue: '0.00', bookedCount: 0 },
      { weekStart: '2026-10-05', revenue: '0.00', bookedCount: 0 },
    ]);
  });

  it('utilizationPct is 0 (never NaN) when the window has no slots', async () => {
    const { svc } = makeService({ venueIds: ['v1'], pitchIds: ['p1'], slots: { total: 0, booked: 0 } });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.utilizationPct).toBe(0);
  });

  it('utilizationPct is booked/total ×100 rounded to 1 decimal', async () => {
    const { svc } = makeService({ venueIds: ['v1'], pitchIds: ['p1'], slots: { total: 3, booked: 1 } });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.utilizationPct).toBe(33.3);
  });

  it('venues without pitches: zeroed trend + 0% utilization, no pitch-scoped queries', async () => {
    const { svc, executed } = makeService({
      venueIds: ['v1'],
      pitchIds: [],
      venueRows: [{ venueId: 'v1', venueName: 'A', bookedCount: 0, revenue: '0.00' }],
    });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.fourWeekTrend).toHaveLength(4);
    expect(res.utilizationPct).toBe(0);
    expect(res.perVenue).toHaveLength(1);
    expect(executed).toHaveLength(1);
  });

  it('perVenue is ordered by revenue DESC with string money + numeric counts', async () => {
    const { svc } = makeService({
      venueIds: ['v1', 'v2'],
      pitchIds: ['p1', 'p2'],
      venueRows: [
        { venueId: 'v1', venueName: 'Low', bookedCount: 1, revenue: '100.00' },
        { venueId: 'v2', venueName: 'High', bookedCount: 4, revenue: '900.00' },
      ],
    });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.perVenue.map((v) => v.venueId)).toEqual(['v2', 'v1']);
    for (const v of res.perVenue) {
      expect(typeof v.revenue).toBe('string');
      expect(typeof v.bookedCount).toBe('number');
    }
  });

  it('scope isolation: an owner with 2 venues never sees a 3rd venue row', async () => {
    const { svc, executed } = makeService({
      venueIds: ['v1', 'v2'],
      pitchIds: ['p1', 'p2'],
      venueRows: [
        { venueId: 'v1', venueName: 'Mine A', bookedCount: 1, revenue: '100.00' },
        { venueId: 'v2', venueName: 'Mine B', bookedCount: 2, revenue: '200.00' },
        { venueId: 'v3', venueName: 'Someone else', bookedCount: 9, revenue: '9999.00' },
      ],
    });
    const res = await svc.getEarnings('owner', 'VenueOwner');
    expect(res.perVenue.map((v) => v.venueId)).toEqual(['v2', 'v1']);

    const perVenueQ = executed.find((q) => q.sql.includes('"venueId"'));
    expect(perVenueQ?.params).toEqual(expect.arrayContaining(['v1', 'v2']));
    expect(perVenueQ?.params).not.toContain('v3');
    // Trend + utilization are pitch-scoped to the owner's pitches only.
    for (const q of executed.filter((e) => !e.sql.includes('"venueId"'))) {
      expect(q.params).toEqual(expect.arrayContaining(['p1', 'p2']));
    }
    // varchar(36) ids — never cast to uuid.
    for (const q of executed) expect(q.sql).not.toContain('::uuid');
  });

  it('window is the Riyadh 28-day range and excludes cancelled matches', async () => {
    const { svc, executed } = makeService({ venueIds: ['v1'], pitchIds: ['p1'] });
    await svc.getEarnings('owner', 'VenueOwner');
    for (const q of executed) {
      expect(q.params).toEqual(expect.arrayContaining(['2026-09-14', '2026-10-11']));
    }
    const matchQueries = executed.filter((q) => !q.sql.includes('FILTER'));
    for (const q of matchQueries) {
      expect(q.sql).toContain("<> 'Cancelled'");
      expect(q.sql).toContain('pitch_cost_sar');
    }
  });
});
