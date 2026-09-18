import { PgDialect } from 'drizzle-orm/pg-core';
import { VenuesService, extractNeighborhood } from './venues.service';

/**
 * Search-suggestions specs — GET /venues/suggestions.
 *
 * Two layers are pinned here:
 *  1. `extractNeighborhood` — the deterministic address → neighborhood label
 *     extractor (the schema has NO district column; neighborhoods live in the
 *     free-text address).
 *  2. `findSuggestions` SQL shape — rendered via `PgDialect().sqlToQuery()`
 *     (same assertion pattern as venues.search.spec.ts): additive AND
 *     discipline, approved-only, prefix matching on city, substring on
 *     address, ranked by venue count.
 */
describe('extractNeighborhood', () => {
  it('strips the District type word from the leading segment', () => {
    expect(extractNeighborhood('Olaya District, Prince Mohammed Bin Abdulaziz Rd, Riyadh 12241')).toBe('Olaya');
    expect(extractNeighborhood('Al-Malqa District, Anas Bin Malik Rd, Riyadh 13521')).toBe('Al-Malqa');
  });

  it('keeps multi-word place names before "District" intact', () => {
    expect(
      extractNeighborhood('King Saud University Campus, King Abdullah Rd, Riyadh 11451'),
    ).toBe('King Saud University Campus');
  });

  it('handles the Arabic حي form', () => {
    expect(extractNeighborhood('حي الملقا، طريق أنس بن مالك، الرياض')).toBe('الملقا');
  });

  it('falls back to the bare first comma segment', () => {
    expect(extractNeighborhood('Al-Nakheel, King Abdulaziz Rd, Jeddah 23441')).toBe('Al-Nakheel');
  });

  it('returns null for street/road-leading and postal-leading segments', () => {
    expect(extractNeighborhood('12241 Riyadh, Prince Sultan Rd')).toBeNull();
    expect(extractNeighborhood('King Abdullah Rd, Riyadh')).toBeNull();
    expect(extractNeighborhood('Building 7, King Saud University')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractNeighborhood('')).toBeNull();
    expect(extractNeighborhood('   ')).toBeNull();
    expect(extractNeighborhood(undefined as unknown as string)).toBeNull();
  });
});

describe('VenuesService findSuggestions — SQL shape', () => {
  const dialect = new PgDialect();

  function makeService() {
    let lastSql: { sql: string; params: unknown[] } | null = null;
    const db = {
      execute: async (query: unknown) => {
        lastSql = dialect.sqlToQuery(query as never);
        return [];
      },
    };
    const service = new VenuesService(db as never);
    return { service, getSql: () => lastSql };
  }

  it('queries approved venues grouped by city+address, ranked by count', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions({});

    const sql = getSql()!.sql;
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('GROUP BY v.city, v.address');
    expect(sql).toContain('COUNT(*)::int');
    expect(sql).not.toContain('ILIKE'); // no q/city → no text clauses
  });

  it('matches city as a case-insensitive PREFIX and address as a substring', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions({ q: 'ola' });

    const sql = getSql()!.sql;
    expect(sql).toMatch(/LOWER\(v\.city\) LIKE/);
    expect(sql).toMatch(/LOWER\(v\.address\) LIKE/);
    expect(getSql()!.params).toContain('ola%'); // city prefix
    expect(getSql()!.params).toContain('%ola%'); // address substring
  });

  it('combines the typed prefix with a resolved-city filter (additive AND)', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions({ q: 'mal', city: 'Riyadh' });

    const sql = getSql()!.sql;
    expect(sql).toMatch(/LOWER\(v\.city\) LIKE/);
    expect(sql).toMatch(/v\.city ILIKE/);
    expect(getSql()!.params).toContain('%Riyadh%');
  });

  it('lat+lng resolves the user city via a PostGIS nearest-venue subquery', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions({ lat: 24.71, lng: 46.68 });

    const sql = getSql()!.sql;
    expect(sql).toContain('ST_Distance');
    expect(sql).toMatch(/v\.city = /); // exact-city lock (nearest venue's city)
    expect(getSql()!.params).toContain(46.68);
    expect(getSql()!.params).toContain(24.71);
  });

  it('locks to the nearest city even when a profile city is ALSO sent (geo wins)', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions({ lat: 21.49, lng: 39.19, city: 'Riyadh' });

    const sql = getSql()!.sql;
    expect(sql).toContain('ST_Distance');
    expect(sql).not.toContain('ILIKE'); // profile-city clause suppressed
  });

  it('rejects lat without lng (and vice versa)', async () => {
    const { service } = makeService();
    await expect(
      service.findSuggestions({ lat: 24.7 } as never),
    ).rejects.toThrow(/Both lat and lng/);
    await expect(
      service.findSuggestions({ lng: 46.7 } as never),
    ).rejects.toThrow(/Both lat and lng/);
  });
});

describe('VenuesService findSuggestions — ranking', () => {
  it('merges duplicate neighborhoods within a city and sorts by venue_count DESC', async () => {
    const db = {
      execute: async () => [
        // Same neighborhood in two address spellings → merged (sums to 3).
        { city: 'Riyadh', address: 'Olaya District, Rd A, Riyadh', venue_count: 2 },
        { city: 'Riyadh', address: 'OLAYA, Rd B, Riyadh', venue_count: 1 },
        { city: 'Riyadh', address: 'Al-Malqa District, Rd C, Riyadh', venue_count: 1 },
        { city: 'Jeddah', address: 'Al-Nakheel District, Rd D, Jeddah', venue_count: 1 },
      ],
    };
    const service = new VenuesService(db as never);
    const rows = await service.findSuggestions({});

    expect(rows[0]).toMatchObject({ city: 'Riyadh', neighborhood: 'Olaya', venue_count: 3 });
    // Olaya (3) first; the 1-venue tie breaks on city ASC (Jeddah < Riyadh).
    expect(rows.map((r) => r.neighborhood)).toEqual(['Olaya', 'Al-Nakheel', 'Al-Malqa']);
    expect(rows.length).toBeLessThanOrEqual(8); // SUGGESTIONS_LIMIT
  });

  it('drops rows whose address yields no neighborhood', async () => {
    const db = {
      execute: async () => [
        { city: 'Riyadh', address: '12241 Riyadh, Prince Sultan Rd', venue_count: 4 },
        { city: 'Riyadh', address: 'Al-Malqa District, Rd C, Riyadh', venue_count: 1 },
      ],
    };
    const service = new VenuesService(db as never);
    const rows = await service.findSuggestions({});
    expect(rows).toHaveLength(1);
    expect(rows[0].neighborhood).toBe('Al-Malqa');
  });
});
