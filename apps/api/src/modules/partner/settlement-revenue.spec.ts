/**
 * P2-216 (run #163): the settlement window/guard contract — BOTH money paths
 * (partner requestPayout + admin generatePending) must render the SAME
 * money-source SQL, with parametrized Riyadh bounds and an interval-overlap
 * dedupe guard. Rendered via PgDialect.sqlToQuery so the assertions bite the
 * exact SQL + bound params Postgres will run, not a mock's memory of it.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildSettlementRevenueQuery } from './settlement-revenue';

const dialect = new PgDialect();
const renderQ = (opts: Parameters<typeof buildSettlementRevenueQuery>[0]) =>
  dialect.sqlToQuery(buildSettlementRevenueQuery(opts));

describe('buildSettlementRevenueQuery — the one settlement money source (P2-216)', () => {
  const RIYADH_END = '2026-10-25';

  it('window bounds are parametrized Riyadh dates [end−cadence, end+1), never server CURRENT_DATE', () => {
    const q = renderQ({ venueIds: ['v1'], cadenceDays: 7, riyadhEnd: RIYADH_END });
    // Both bounds are timestamptz built from bound date params via the repo's
    // (date::timestamp AT TIME ZONE 'Asia/Riyadh') idiom.
    expect(q.sql.match(/::date::timestamp AT TIME ZONE 'Asia\/Riyadh'/g)).toHaveLength(2);
    expect(q.params).toContain('2026-10-18'); // riyadhEnd − 7
    expect(q.params).toContain('2026-10-26'); // riyadhEnd + 1
    // The whole reason this query was extracted: no bare CURRENT_DATE whose
    // meaning silently follows the Postgres server's timezone.
    expect(q.sql).not.toContain('CURRENT_DATE');
  });

  it('dedupe guard is an INTERVAL OVERLAP test on [period_start, period_end]', () => {
    const q = renderQ({ venueIds: ['v1'], cadenceDays: 7, riyadhEnd: RIYADH_END });
    expect(q.sql).toContain('NOT EXISTS');
    expect(q.sql).toMatch(/s\.period_start\s*<=\s*\$\d+::date/);
    expect(q.sql).toMatch(/s\.period_end\s*>=\s*\$\d+::date/);
    expect(q.params).toContain(RIYADH_END);   // windowEnd bound
    expect(q.params).toContain('2026-10-18'); // windowStart bound
  });

  it('overlap guard beats a single-bound guard (the mixed-axis double-window case)', () => {
    // A legacy generator row stamped on the UTC axis: period_start 2026-10-24
    // (UTC), period_end 2026-10-24 — the OLD guard (period_start >=
    // '2026-10-18') PASSED it and let a partner request stamp the overlapping
    // Riyadh window [10-18..10-25] on top. Overlap semantics block it:
    // 10-24 <= 10-25 AND 10-24 >= 10-18 → NOT EXISTS fails → venue skipped.
    const overlaps = (ps: string, pe: string, ws: string, we: string) =>
      // YYYY-MM-DD sorts lexicographically — plain string compare.
      ps <= we && pe >= ws;
    expect(overlaps('2026-10-24', '2026-10-24', '2026-10-18', '2026-10-25')).toBe(true);
    // A genuinely older window (settled through 10-17) does NOT block.
    expect(overlaps('2026-10-11', '2026-10-17', '2026-10-18', '2026-10-25')).toBe(false);
  });

  it('venue scope rides the locked id list as bound params', () => {
    const q = renderQ({ venueIds: ['venue-a', 'venue-b'], cadenceDays: 7, riyadhEnd: RIYADH_END });
    expect(q.sql).toContain('v.id IN');
    expect(q.params).toEqual(expect.arrayContaining(['venue-a', 'venue-b']));
    expect(q.sql).not.toContain('::uuid');
  });

  it('empty venue list renders TRUE (admin generator: venue lock held in-tx), not a broken IN ()', () => {
    const q = renderQ({ venueIds: [], cadenceDays: 7, riyadhEnd: RIYADH_END });
    expect(q.sql).not.toContain('IN ()');
    expect(q.sql).toContain('WHERE TRUE');
    // Still no CURRENT_DATE and no uuid casts on the admin path either.
    expect(q.sql).not.toContain('CURRENT_DATE');
    expect(q.sql).not.toContain('::uuid');
  });

  it('money leaves as an exact decimal string — never a float (P2-4 tripwire)', () => {
    const q = renderQ({ venueIds: ['v1'], cadenceDays: 14, riyadhEnd: RIYADH_END });
    expect(q.sql).toContain(')::numeric(12,2)::text AS amount');
    expect(q.sql).not.toMatch(/pitch_cost_sar[^)]*::float/i);
  });

  it('cross-path determinism: partner and admin cadence windows render identical bounds SQL', () => {
    // The property the two paths lost in the pre-#163 drift: same cadence +
    // same riyadhEnd → identical money SQL regardless of which path renders
    // it (both now call THIS function). Scope + param numbering are
    // normalized — the bounds/guard shape must match verbatim.
    const a = renderQ({ venueIds: ['v1'], cadenceDays: 7, riyadhEnd: RIYADH_END });
    const b = renderQ({ venueIds: [], cadenceDays: 7, riyadhEnd: RIYADH_END });
    const normalize = (q: { sql: string }) =>
      q.sql
        .replace(/WHERE (v\.id IN \([^)]*\)|TRUE)/, 'WHERE <SCOPE>')
        .replace(/\$\d+/g, '$?');
    expect(normalize(a)).toBe(normalize(b));
  });
});
