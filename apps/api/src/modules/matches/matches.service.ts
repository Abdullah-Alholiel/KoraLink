import {
  Injectable,
  BadRequestException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches } from '../../database/schema';
import { GetMatchesDto } from './dto/get-matches.dto';

/** Margin added on top of the raw pitch cost per player (SAR). */
const PLATFORM_MARGIN_SAR = 5;

export interface NearbyMatchRow {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: number;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  venue_name: string;
  venue_city: string;
}

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class MatchesService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery feed — PostGIS ST_DWithin geo-filter
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns open matches within `radius_km` of the given coordinates,
   * optionally filtered by date.
   *
   * Uses Drizzle's `sql` template tag for raw PostGIS function calls so the
   * ORM does not need to understand the `geography` column type.
   *
   * ST_DWithin implementation:
   *   ST_DWithin(m.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radiusMetres)
   * returns true when the great-circle distance (metres) is within the radius.
   */
  async findNearby(dto: GetMatchesDto): Promise<NearbyMatchRow[]> {
    const { lat, lng, radius_km = 10, date } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const radiusMetres = radius_km * 1000;
    const hasCoords = lat !== undefined && lng !== undefined;

    // ── Date window filter ─────────────────────────────────────────────────
    const dateClause = date
      ? sql`AND m.scheduled_at::date = ${date}::date`
      : sql``;

    // ── Geo filter ─────────────────────────────────────────────────────────
    // ST_DWithin on the denormalised `location` geography column.
    // Great-circle distance in metres is used for the radius check.
    const geoClause = hasCoords
      ? sql`
          AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMetres}
          )`
      : sql``;

    // ── Distance expression ────────────────────────────────────────────────
    const distanceExpr = hasCoords
      ? sql`ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(${lng ?? 0}, ${lat ?? 0}), 4326)::geography
          )`
      : sql`NULL`;

    // db.execute returns rows typed as Record<string,unknown>[] for raw SQL;
    // the SELECT list is fixed, so the cast to NearbyMatchRow[] is safe here.
    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.match_type,
        m.gender_rule,
        m.status,
        m.scheduled_at,
        m.duration_mins,
        m.price_per_player::float AS price_per_player,
        m.max_players,
        COUNT(mp.id)::int         AS spots_filled,
        ${distanceExpr}           AS distance_m,
        u.id                      AS host_id,
        u.full_name               AS host_name,
        u.avatar_url              AS host_avatar,
        p.id                      AS pitch_id,
        p.name                    AS pitch_name,
        v.name                    AS venue_name,
        v.city                    AS venue_city
      FROM matches m
      INNER JOIN users   u  ON u.id  = m.host_id
      INNER JOIN pitches p  ON p.id  = m.pitch_id
      INNER JOIN venues  v  ON v.id  = p.venue_id
      LEFT  JOIN match_players mp ON mp.match_id = m.id
      WHERE m.status = 'Open'
        AND m.scheduled_at >= NOW()
        ${geoClause}
        ${dateClause}
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY m.scheduled_at ASC
      LIMIT 50
    `);

    return rows as unknown as NearbyMatchRow[];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match Engine — price calculation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calculates the price per player.
   *
   * Formula: (pitchCost / (players - 1)) + platformMargin
   *
   * @param pitchCostSar  Total hourly pitch rental cost in SAR.
   * @param players       Expected number of players (must be ≥ 2).
   */
  calculatePricePerPlayer(pitchCostSar: number, players: number): number {
    if (players < 2) {
      throw new BadRequestException('A match requires at least 2 players.');
    }
    const raw = pitchCostSar / (players - 1) + PLATFORM_MARGIN_SAR;
    return Math.ceil(raw * 100) / 100; // round up to 2 d.p.
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Single match detail (with relations)
  // ─────────────────────────────────────────────────────────────────────────

  async findOne(matchId: string) {
    const match = await this.db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      with: {
        host: {
          columns: {
            id: true,
            full_name: true,
            handle: true,
            avatar_url: true,
            rating: true,
            karma_score: true,
          },
        },
        pitch: {
          with: {
            venue: {
              columns: {
                name: true,
                city: true,
                address: true,
                amenities: true,
              },
            },
          },
        },
        players: {
          with: {
            user: {
              columns: {
                id: true,
                full_name: true,
                handle: true,
                avatar_url: true,
                rating: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    return match;
  }
}
