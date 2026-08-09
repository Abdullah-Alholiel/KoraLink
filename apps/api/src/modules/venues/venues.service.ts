import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { venues } from '../../database/schema';
import { GetVenuesDto } from './dto/get-venues.dto';

export interface NearbyVenueRow {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: unknown;
  rating: number;
  is_approved: boolean;
  distance_m: number | null;
  owner_id: string;
  owner_name: string | null;
  pitch_count: number;
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
    const { lat, lng, radius_km = 10, city } = dto;

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
        v.rating,
        v.is_approved,
        ${distanceExpr} AS distance_m,
        v.owner_id,
        u.full_name AS owner_name,
        COUNT(p.id)::int AS pitch_count
      FROM venues v
      INNER JOIN users u ON u.id = v.owner_id
      LEFT JOIN pitches p ON p.venue_id = v.id
      WHERE v.is_approved = true
        ${cityClause}
        ${geoClause}
      GROUP BY v.id, u.id
      ORDER BY
        ${hasCoords ? sql`distance_m ASC,` : sql``}
        v.rating DESC
      LIMIT 50
    `);

    return rows as unknown as NearbyVenueRow[];
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
            rating: true,
          },
        },
        pitches: {
          columns: {
            id: true,
            name: true,
            size: true,
            surface_type: true,
            hourly_rate: true,
            is_available: true,
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} not found.`);
    }

    return venue;
  }
}
