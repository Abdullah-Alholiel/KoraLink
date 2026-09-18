import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { venues } from '../../database/schema';
import { GetVenuesDto } from './dto/get-venues.dto';
import { GetVenueSuggestionsDto } from './dto/get-venue-suggestions.dto';

/** Row shape returned by VenuesService.findSuggestions. */
export interface VenueSuggestionRow {
  /** Venue city, e.g. "Riyadh" (canonical value from the venues table). */
  city: string;
  /**
   * Neighborhood label extracted from the venue's free-text address
   * ("Olaya District, …" → "Olaya"). Rendered as the suggestion chip label.
   */
  neighborhood: string;
  /** Number of approved venues at this city + neighborhood pair. */
  venue_count: number;
}

/** Hard cap on suggestion rows returned to a client. */
const SUGGESTIONS_LIMIT = 8;

/**
 * Deterministic neighborhood extractor for venue addresses. The schema has NO
 * dedicated district column — the neighborhood is the leading segment of the
 * free-text address. Strategy (first match wins):
 *   1. "X District" / "X Neighbourhood" / "X Quarter" (EN or حي X in AR)
 *   2. "<first segment>, …" — text before the first comma, stripped of a
 *      trailing District-ish word. Length-capped and stop-word-guarded so a
 *      leading street name never masquerades as a neighborhood.
 * Returns null when no plausible neighborhood exists (caller drops the row).
 */
export function extractNeighborhood(address: string): string | null {
  const text = (address ?? '').trim();
  if (!text) return null;

  // AR form: "حي الملقا" / "حي العليا"
  const ar = text.match(/حي\s+([\u0600-\u06FF\u064E-\u0652\s]{2,40}?)(?:[،,]|$)/);
  if (ar?.[1]) return ar[1].trim();

  const first = text.split(/[،,]/)[0].trim();
  if (!first) return null;

  // EN form: "Olaya District" → "Olaya" (keep the name, drop the type word)
  const en = first.match(
    /^(.{2,40}?)\s+(?:district|neighbourhood|neighborhood|quarter)\b/i,
  );
  if (en?.[1]) return en[1].trim();

  // Bare first segment: guard against street/road labels and number+name forms
  // ("12241 Riyadh", "King Abdullah Rd") — those are not neighborhoods.
  if (/^\d/.test(first)) return null;
  if (/^(?:street|st\b|road|rd\b|avenue|ave\b|way|boulevard|blvd\b|highway|hwy\b|building|tower)\b/i.test(first)) {
    return null;
  }
  // A segment ENDING in a road-type word is a street name, not a district
  // ("King Abdullah Rd", "Prince Sultan Road", "طريق الملك عبدالله").
  if (/(?:\b(?:rd|road|st|street|ave|avenue|blvd|boulevard|hwy|highway|way)|طريق)$/i.test(first)) {
    return null;
  }
  if (!/[A-Za-z\u0600-\u06FF]/.test(first)) return null;
  if (first.length > 40) return null;

  // Drop a leading standalone postal/zone number ("11451 Riyadh 12" → keep
  // only when at least one letter is present — already guaranteed above).
  return first;
}

export interface NearbyVenueRow {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: unknown;
  is_approved: boolean;
  is_koralink_partner: boolean;
  distance_m: number | null;
  owner_id: string;
  owner_name: string | null;
  pitch_count: number;
  // P1-25 operating hours (raw fields; clients derive open/closed state).
  open_hour: number;
  close_hour: number;
  closed_day_0: boolean;
  closed_day_1: boolean;
  closed_day_2: boolean;
  closed_day_3: boolean;
  closed_day_4: boolean;
  closed_day_5: boolean;
  closed_day_6: boolean;
}

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class VenuesService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Returns approved venues, optionally filtered by city or geo-proximity.
   * Uses PostGIS ST_DWithin for geo-filtering (same pattern as matches service).
   */
  async findNearby(dto: GetVenuesDto): Promise<NearbyVenueRow[]> {
    const { lat, lng, radius_km = 50, city, is_koralink_partner, search } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const hasCoords = lat !== undefined && lng !== undefined;
    const radiusMetres = radius_km * 1000;

    const geoClause = hasCoords
      ? sql`
          AND ST_DWithin(
            v.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMetres}
          )`
      : sql``;

    const cityClause = city
      ? sql`AND v.city ILIKE ${'%' + city + '%'}`
      : sql``;

    // P1-28 (run #21): server-side free-text search — additive AND, never
    // short-circuits geo/city/partner predicates. ILIKE substring on name OR
    // city; pg_trgm similarity ranking is a later perf/ranking option.
    const searchTerm = search?.trim();
    const searchClause = searchTerm
      ? sql`AND (v.name ILIKE ${'%' + searchTerm + '%'} OR v.city ILIKE ${'%' + searchTerm + '%'} OR v.address ILIKE ${'%' + searchTerm + '%'})`
      : sql``;

    const partnerClause = is_koralink_partner !== undefined
      ? sql`AND v.is_koralink_partner = ${is_koralink_partner}`
      : sql``;

    const distanceExpr = hasCoords
      ? sql`ST_Distance(
            v.location,
            ST_SetSRID(ST_MakePoint(${lng ?? 0}, ${lat ?? 0}), 4326)::geography
          )`
      : sql`NULL`;

    const rows = await this.db.execute(sql`
      SELECT
        v.id,
        v.name,
        v.city,
        v.address,
        v.amenities,
        v.is_approved,
        v.is_koralink_partner,
        ${distanceExpr} AS distance_m,
        v.owner_id,
        u.full_name AS owner_name,
        COUNT(p.id)::int AS pitch_count,
        v.open_hour::int,
        v.close_hour::int,
        v.closed_day_0, v.closed_day_1, v.closed_day_2, v.closed_day_3,
        v.closed_day_4, v.closed_day_5, v.closed_day_6
      FROM venues v
      INNER JOIN users u ON u.id = v.owner_id
      LEFT JOIN pitches p ON p.venue_id = v.id
      WHERE v.is_approved = true
        ${searchClause}
        ${cityClause}
        ${partnerClause}
        ${geoClause}
      GROUP BY v.id, u.id
      ORDER BY
        ${hasCoords ? sql`distance_m ASC,` : sql``}
        v.name ASC
      LIMIT 50
    `);

    return rows as unknown as NearbyVenueRow[];
  }

  /**
   * Distinct city + neighborhood suggestion pairs for the Play/Clubs search
   * bars (search-suggestions feature). Neighborhoods live INSIDE the
   * free-text address column — there is no dedicated district column — so the
   * address is passed to a deterministic prefix extractor:
   *   "Olaya District, Prince Mohammed Bin Abdulaziz Rd, Riyadh 12241"
   *     → neighborhood "Olaya"
   *   "King Saud University Campus, King Abdullah Rd, Riyadh 11451"
   *     → neighborhood "King Saud University"
   * "Most important/popular" ordering = per-pair venue count DESC, then name.
   */
  async findSuggestions(dto: GetVenueSuggestionsDto): Promise<VenueSuggestionRow[]> {
    const { q, city, lat, lng } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const prefix = q?.trim().toLowerCase();
    const searchClause = prefix
      ? sql`AND (LOWER(v.city) LIKE ${prefix + '%'} OR LOWER(v.address) LIKE ${'%' + prefix + '%'})`
      : sql``;
    const cityClause = city?.trim() && lat === undefined
      ? sql`AND v.city ILIKE ${'%' + city.trim() + '%'}`
      : sql``;

    // Location-enabled users (search-suggestions contract): the exact user
    // city is resolved server-side as the NEAREST approved venue's city
    // (native PostGIS — no external geocoder dependency). A venue table with
    // no approved rows degrades to city-wide suggestions (NULL city → no-op).
    const nearestCityExpr = lat !== undefined && lng !== undefined
      ? sql`(
          SELECT nearest.city
          FROM venues nearest
          WHERE nearest.is_approved = true
            AND nearest.location IS NOT NULL
          ORDER BY ST_Distance(
            nearest.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          )
          LIMIT 1
        )`
      : sql`NULL`;

    const rows = await this.db.execute(sql`
      SELECT
        v.city,
        v.address,
        COUNT(*)::int AS venue_count
      FROM venues v
      WHERE v.is_approved = true
        AND (${nearestCityExpr}::text IS NULL OR v.city = ${nearestCityExpr}::text)
        ${searchClause}
        ${cityClause}
      GROUP BY v.city, v.address
      ORDER BY venue_count DESC, v.city ASC, v.address ASC
      LIMIT 200
    `);

    const pairs = new Map<string, VenueSuggestionRow>();
    for (const raw of rows as unknown as Array<{
      city: string;
      address: string;
      venue_count: number;
    }>) {
      const neighborhood = extractNeighborhood(raw.address);
      if (!neighborhood) continue;
      const key = `${raw.city}||${neighborhood.toLowerCase()}`;
      const existing = pairs.get(key);
      if (existing) {
        existing.venue_count += raw.venue_count;
      } else {
        pairs.set(key, {
          city: raw.city,
          neighborhood,
          venue_count: raw.venue_count,
        });
      }
    }

    return [...pairs.values()]
      .sort(
        (a, b) =>
          b.venue_count - a.venue_count ||
          a.city.localeCompare(b.city) ||
          a.neighborhood.localeCompare(b.neighborhood),
      )
      .slice(0, SUGGESTIONS_LIMIT);
  }

  /**
   * Get full venue details including its pitches.
   */
  async findOne(venueId: string) {
    const venue = await this.db.query.venues.findFirst({
      where: eq(venues.id, venueId),
      with: {
        owner: {
          columns: {
            id: true,
            full_name: true,
            handle: true,
            avatar_url: true,
          },
        },
        pitches: {
          columns: {
            id: true,
            name: true,
            size: true,
            surface_type: true,
            hourly_rate: true,
            environment: true,
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} not found.`);
    }

    // P1-25: expose operating hours on the public detail read (Drizzle returns
    // smallint as number; boolean flags pass through unchanged).
    return {
      ...venue,
      open_hour: venue.open_hour,
      close_hour: venue.close_hour,
      closed_day_0: venue.closed_day_0,
      closed_day_1: venue.closed_day_1,
      closed_day_2: venue.closed_day_2,
      closed_day_3: venue.closed_day_3,
      closed_day_4: venue.closed_day_4,
      closed_day_5: venue.closed_day_5,
      closed_day_6: venue.closed_day_6,
    };
  }
}
