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
    const { lat, lng, radius_km = 50, city, is_koralink_partner } = dto;

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
