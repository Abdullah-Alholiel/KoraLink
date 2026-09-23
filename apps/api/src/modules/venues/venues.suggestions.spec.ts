import { PgDialect } from 'drizzle-orm/pg-core';
import { VenuesService, extractNeighborhood } from './venues.service';

/**
 * Search-suggestions specs — GET /venues/suggestions.
 *
 * 2026-09-18 chips redesign: the endpoint is PARAMETERLESS and NATIONWIDE.
 * The client fetches once on focus (5-min cache) and filters per keystroke
 * locally (lib/search-suggestions.ts) — no per-keystroke API load, and chips
 * surface for ANY city regardless of the user's location (the old lat/lng
 * nearest-city lock is gone: it made typing "Jeddah" in Riyadh yield zero
 * suggestions, the "empty panel" bug).
 *
 * Two layers are pinned here:
 *  1. `extractNeighborhood` — the deterministic address → neighborhood label
 *     extractor (the schema has NO district column; neighborhoods live in the
 *     free-text address).
 *  2. `findSuggestions` SQL shape — rendered via `PgDialect().sqlToQuery()`
 *     (same assertion pattern as venues.search.spec.ts): approved-only,
 *     grouped by city+address, ranked by venue count, capped at 50.
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

  it('takes NO query parameters (parameterless nationwide contract)', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions();

    expect(getSql()!.params).toEqual([]); // zero bind params — no user input
  });

  it('queries approved venues grouped by city+address, ranked by count', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions();

    const sql = getSql()!.sql;
    expect(sql).toContain('v.is_approved = true');
    expect(sql).toContain('GROUP BY v.city, v.address');
    expect(sql).toContain('COUNT(*)::int');
    expect(sql).not.toContain('LIKE'); // nationwide: no text clauses at all
    expect(sql).not.toContain('ILIKE');
    expect(sql).not.toContain('ST_Distance'); // no city lock — the bug this fixes
  });

  it('caps raw address groups at 200 in SQL; the service slices merged pairs to 50', async () => {
    const { service, getSql } = makeService();
    await service.findSuggestions();

    // Two-layer cap: SQL LIMIT 200 = pre-merge address groups (popular
    // first), then findSuggestions merges spellings and slices to
    // SUGGESTIONS_LIMIT (50) for the client.
    expect(getSql()!.sql).toContain('LIMIT 200');
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
    const rows = await service.findSuggestions();

    expect(rows[0]).toMatchObject({ city: 'Riyadh', neighborhood: 'Olaya', venue_count: 3 });
    // Olaya (3) first; the 1-venue tie breaks on city ASC (Jeddah < Riyadh).
    expect(rows.map((r) => r.neighborhood)).toEqual(['Olaya', 'Al-Nakheel', 'Al-Malqa']);
    expect(rows.length).toBeLessThanOrEqual(50); // SUGGESTIONS_LIMIT
  });

  it('keeps rows from MULTIPLE cities (nationwide — the old lock kept one)', async () => {
    const db = {
      execute: async () => [
        { city: 'Riyadh', address: 'Olaya District, Rd A, Riyadh', venue_count: 2 },
        { city: 'Jeddah', address: 'Al-Nakheel District, Rd D, Jeddah', venue_count: 1 },
      ],
    };
    const service = new VenuesService(db as never);
    const rows = await service.findSuggestions();

    expect(new Set(rows.map((r) => r.city))).toEqual(new Set(['Riyadh', 'Jeddah']));
  });

  it('drops rows whose address yields no neighborhood', async () => {
    const db = {
      execute: async () => [
        { city: 'Riyadh', address: '12241 Riyadh, Prince Sultan Rd', venue_count: 4 },
        { city: 'Riyadh', address: 'Al-Malqa District, Rd C, Riyadh', venue_count: 1 },
      ],
    };
    const service = new VenuesService(db as never);
    const rows = await service.findSuggestions();
    expect(rows).toHaveLength(1);
    expect(rows[0].neighborhood).toBe('Al-Malqa');
  });
});
