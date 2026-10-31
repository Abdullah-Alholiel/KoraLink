import { PgDialect } from 'drizzle-orm/pg-core';
import { VenuesService } from './venues.service';

/**
 * P2-167 (run #113) — venue-list owner join must be LEFT, never INNER.
 *
 * A missing owner user row (manual SQL, future account-deletion cascade)
 * must NOT silently drop the venue from browse (findNearby) OR from saved
 * favorites (listFavoriteVenues). The two list surfaces must flip JOIN
 * STRENGTH JOINTLY — fixing one alone creates the ids/venues divergence
 * the favorites surface already guards against (listFavoriteIds has no
 * users join; a ghost id would render an empty list with a live heart).
 *
 * Same PgDialect.sqlToQuery pattern as venues.search.spec.ts (P1-28):
 * assert the SQL the service actually sends to Postgres.
 */
describe('VenuesService — owner LEFT JOIN sweep (P2-167)', () => {
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

  it('findNearby LEFT-joins the owner and COALESCEs the display name', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({});

    const sql = getSql()!.sql;
    expect(sql).toContain('LEFT JOIN users u ON u.id = v.owner_id');
    expect(sql).not.toMatch(/INNER JOIN users u/);
    expect(sql).toContain("COALESCE(u.full_name, '') AS owner_name");
    // The join-strength change must not weaken the approved predicate.
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('LIMIT 50');
  });

  it('listFavoriteVenues LEFT-joins the owner identically (joint sweep)', async () => {
    const { service, getSql } = makeService();
    await service.listFavoriteVenues('user-1');

    const sql = getSql()!.sql;
    expect(sql).toContain('LEFT JOIN users u ON u.id = v.owner_id');
    expect(sql).not.toMatch(/INNER JOIN users u/);
    expect(sql).toContain("COALESCE(u.full_name, '') AS owner_name");
    expect(sql).toContain('vf.user_id');
  });

  it('keeps the pitches join LEFT (owner flip must not touch it) and GROUP BY intact', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ search: 'Kings' });

    const sql = getSql()!.sql;
    expect(sql).toContain('LEFT JOIN pitches p ON p.venue_id = v.id');
    expect(sql).toMatch(/GROUP BY v\.id, u\.id/);
    // pitch_count stays a real aggregate over the LEFT-joined pitches.
    expect(sql).toContain('COUNT(p.id)::int AS pitch_count');
  });
});
