import { PgDialect } from 'drizzle-orm/pg-core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetVenuesDto } from './dto/get-venues.dto';
import { VenuesService } from './venues.service';

/**
 * P2-173 (run #119) — "Top Rated" venue sort specs.
 *
 * Same assertion pattern as P1-28 search specs (PgDialect.sqlToQuery renders
 * the exact SQL the service sends). Contract under test:
 *   * default (no sort)  = today's exact ORDER BY: [distance_m ASC,] v.name ASC
 *   * sort=top_rated     = ORDER BY v.rating_avg DESC, v.rating_count DESC,
 *     v.name ASC — coords-INDEPENDENT (distance_m selected but never orders)
 *   * sort NEVER changes the WHERE (additive-only rule; is_approved stays)
 *   * the two rating columns ride the SELECT on EVERY query (row shape is
 *     additive — PWA cards show stars on every tab)
 *   * junk sort values fail DTO validation (IsIn → 400 at the pipe)
 */
describe('VenuesService findNearby — top-rated sort (P2-173)', () => {
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
    return { service, getSql: () => lastSql as { sql: string; params: unknown[] } };
  }

  it('keeps the default order untouched when no sort is provided', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({});

    const sql = getSql().sql;
    // Default contract: name ASC, no rating ordering.
    expect(sql).toMatch(/ORDER BY\s*\n?\s*v\.name ASC/);
    expect(sql).not.toContain('v.rating_avg DESC');
    // Row shape is additive: rating columns ride EVERY query.
    expect(sql).toContain('v.rating_avg::float8 AS rating_avg');
    expect(sql).toContain('v.rating_count::int AS rating_count');
    // Additive discipline intact.
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('LIMIT 50');
  });

  it('orders by rating (avg desc, count desc, name asc) for top_rated', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ sort: 'top_rated' });

    const sql = getSql().sql;
    expect(sql).toMatch(
      /ORDER BY\s*\n?\s*v\.rating_avg DESC, v\.rating_count DESC, v\.name ASC/,
    );
    // Distance must NOT order rows even though the column may be selected.
    expect(sql).not.toMatch(/distance_m ASC/);
    // The WHERE is untouched by sort (additive-only rule).
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('LIMIT 50');
  });

  it('ignores coordinates for ordering when top_rated is set (rating wins over proximity)', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ sort: 'top_rated', lat: 24.7, lng: 46.7 });

    const sql = getSql().sql;
    // Geo filter still narrows (ST_DWithin stays), but ordering is pure rating.
    expect(sql).toContain('ST_DWithin');
    expect(sql).toMatch(
      /ORDER BY\s*\n?\s*v\.rating_avg DESC, v\.rating_count DESC, v\.name ASC/,
    );
    expect(sql).not.toMatch(/distance_m ASC/);
  });

  it('preserves the geo distance order for the default sort with coords', async () => {
    const { service, getSql } = makeService();
    await service.findNearby({ lat: 24.7, lng: 46.7 });

    const sql = getSql().sql;
    expect(sql).toMatch(/ORDER BY\s*\n?\s*distance_m ASC,/);
    expect(sql).not.toContain('v.rating_avg DESC');
  });

  it('rejects junk sort values at the DTO (IsIn → 400 at the pipe)', async () => {
    const dto = plainToInstance(GetVenuesDto, { sort: 'cheapest' });
    const errors = await validate(dto, { whitelist: true });
    const sortErrors = errors.find((e) => e.property === 'sort');
    expect(sortErrors).toBeDefined();
    expect(sortErrors?.constraints).toHaveProperty('isIn');
  });

  it('accepts both documented sort values at the DTO', async () => {
    for (const sort of ['distance', 'top_rated']) {
      const dto = plainToInstance(GetVenuesDto, { sort });
      const errors = await validate(dto, { whitelist: true });
      expect(errors).toEqual([]);
    }
  });
});
