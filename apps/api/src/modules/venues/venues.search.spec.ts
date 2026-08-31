import { PgDialect } from 'drizzle-orm/pg-core';
import { VenuesService } from './venues.service';

/**
 * P1-28 (run #21) — server-side venue search specs.
 * The service is instantiated with a stubbed Drizzle DB whose `execute`
 * captures the raw SQL template; `PgDialect().sqlToQuery()` renders it to
 * text + params (same assertion pattern as P1-21/P1-34), so we assert the
 * CLAUSE the service actually sends to Postgres — additive AND discipline
 * (never short-circuits geo/city/partner/approved predicates).
 */
describe('VenuesService findNearby — search (P1-28)', () => {
  const dialect = new PgDialect();

  function makeService() {
    let lastSql: { sql: string; params: unknown[] } | null = null;
    const db = {
      execute: async (query: unknown) => {
        lastSql = dialect.sqlToQuery(query as never);
        return { rows: [] };
      },
    };
    const service = new VenuesService(db as never);
    return { service, getSql: () => lastSql };
  }

  it('adds an additive name/city ILIKE clause when search is provided', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ search: 'Kings' });

    const sql = getSql()!.sql;
    expect(sql).toMatch(/v\.name ILIKE/);
    expect(sql).toMatch(/v\.city ILIKE/);
    expect(getSql()!.params).toContain('%Kings%');

    // Additive discipline: the approved predicate + LIMIT still present,
    // and no predicate was replaced.
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('LIMIT 50');
  });

  it('omits the search clause for empty/whitespace search', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ search: '   ' });
    expect(getSql()!.sql).not.toContain('ILIKE');
  });

  it('combines search with geo + city filters (all clauses additive)', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ search: 'kings', lat: 24.7, lng: 46.7, city: 'Riyadh' });

    const sql = getSql()!.sql;
    expect(sql).toContain('ST_DWithin');
    expect(sql).toMatch(/v\.city ILIKE/); // city filter clause
    expect(sql).toMatch(/v\.name ILIKE/); // search clause
    expect(sql).toContain('v.is_koralink_partner'); // partner clause rendered (NULL no-op)
    expect(sql).toContain('LIMIT 50');
  });

  it('does not require coordinates — search works standalone', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ search: 'Olaya' });
    expect(getSql()!.sql).not.toContain('ST_DWithin');
    expect(getSql()!.sql).toMatch(/v\.name ILIKE/);
    expect(getSql()!.params).toContain('%Olaya%');
  });
});
