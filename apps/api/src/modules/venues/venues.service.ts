import { Injectable, BadRequestException, ForbiddenException, Inject, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { venues, venue_favorites, venue_reviews } from '../../database/schema';
import { escapeLikePattern } from '../../common/utils/escape-like';
import { GetVenuesDto } from './dto/get-venues.dto';

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

/** P2-161: idempotent favorite/unfavorite response contract. */
export interface FavoriteMutationResult {
  /** True when favorited, false when not favorited. */
  favorited: boolean;
  /** addFavorite: a row was actually inserted (false = already favorited). */
  created?: boolean;
  /** removeFavorite: a row was actually deleted (false = was not favorited). */
  removed?: boolean;
}

/** P1-55: review submit response contract (upsert analog of the
 *  return-findOne-after-tx rule — aggregates are computed from THIS tx, so
 *  they are exactly the state the write produced, without a re-read). */
export interface ReviewMutationResult {
  review: {
    id: string;
    venue_id: string;
    user_id: string;
    match_id: string;
    rating: number;
    comment: string | null;
    created_at: Date;
    updated_at: Date;
  };
  venueRating: { average: number; count: number };
}

/**
 * Hard cap on suggestion rows returned to a client. 2026-09-18 chips
 * redesign: the list is NATIONWIDE (no city lock) and the client filters
 * per keystroke, so the cap covers several cities × their neighborhoods.
 */
const SUGGESTIONS_LIMIT = 50;

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
      ? sql`AND v.city ILIKE ${'%' + escapeLikePattern(city) + '%'} ESCAPE '\\'`
      : sql``;

    // P1-28 (run #21): server-side free-text search — additive AND, never
    // short-circuits geo/city/partner predicates. ILIKE substring on name OR
    // city; pg_trgm similarity ranking is a later perf/ranking option.
    const searchTerm = search?.trim();
    const searchClause = searchTerm
      ? sql`AND (v.name ILIKE ${'%' + escapeLikePattern(searchTerm) + '%'} ESCAPE '\\' OR v.city ILIKE ${'%' + escapeLikePattern(searchTerm) + '%'} ESCAPE '\\' OR v.address ILIKE ${'%' + escapeLikePattern(searchTerm) + '%'} ESCAPE '\\')`
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
        COALESCE(u.full_name, '') AS owner_name,
        COUNT(p.id)::int AS pitch_count,
        v.open_hour::int,
        v.close_hour::int,
        v.closed_day_0, v.closed_day_1, v.closed_day_2, v.closed_day_3,
        v.closed_day_4, v.closed_day_5, v.closed_day_6
      FROM venues v
      LEFT JOIN users u ON u.id = v.owner_id
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
   * bars (search-suggestions feature, 2026-09-18 chips redesign). The list is
   * NATIONWIDE and parameterless: the client fetches it once on focus, caches
   * it, and filters per keystroke (Arabic-aware, lib/search-suggestions.ts) —
   * so typing "Jeddah" surfaces Jeddah chips even for a Riyadh user, and no
   * keystroke ever hits the API. Neighborhoods live INSIDE the free-text
   * address column — there is no dedicated district column — so the address
   * is passed to a deterministic prefix extractor:
   *   "Olaya District, Prince Mohammed Bin Abdulaziz Rd, Riyadh 12241"
   *     → neighborhood "Olaya"
   *   "King Saud University Campus, King Abdullah Rd, Riyadh 11451"
   *     → neighborhood "King Saud University"
   * "Most important/popular" ordering = per-pair venue count DESC, then name.
   */
  async findSuggestions(): Promise<VenueSuggestionRow[]> {
    const rows = await this.db.execute(sql`
      SELECT
        v.city,
        v.address,
        COUNT(*)::int AS venue_count
      FROM venues v
      WHERE v.is_approved = true
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

  // ── P2-161: venue favorites (run #109) ──────────────────────────────────
  // Composite PK (user_id, venue_id) makes both directions idempotent.
  // Listing mirrors findNearby's EXACT row shape (adapt-by-extending rule) so
  // the PWA consumes VenueApi[] with zero new adapter code; distance is
  // always NULL (favorites are not geo-ranked) and ordering is newest-first.

  /** The favorited ids for a user — the PWA heart-state source. Only ids the
   *  list endpoint would also return (approved venues); a venue unapproved
   *  after favoriting disappears from BOTH rather than half-existing. */
  async listFavoriteIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ venue_id: venue_favorites.venue_id })
      .from(venue_favorites)
      .innerJoin(venues, eq(venues.id, venue_favorites.venue_id))
      .where(and(eq(venue_favorites.user_id, userId), eq(venues.is_approved, true)))
      // Run #111: name tiebreaker — mirrors listFavoriteVenues' ordering so
      // the ids list and the venues list can never disagree on tie order.
      .orderBy(sql`venue_favorites.created_at DESC`, sql`venues.name ASC`);
    return rows.map((r) => r.venue_id);
  }

  /** Full venue rows for the user's favorites, newest-first, findNearby shape. */
  async listFavoriteVenues(userId: string) {
    const res = await this.db.execute(sql`
      SELECT
        v.id,
        v.name,
        v.city,
        v.address,
        v.amenities,
        v.is_approved,
        v.is_koralink_partner,
        NULL::float8 AS distance_m,
        v.owner_id,
        COALESCE(u.full_name, '') AS owner_name,
        COUNT(p.id)::int AS pitch_count,
        v.open_hour::int,
        v.close_hour::int,
        v.closed_day_0, v.closed_day_1, v.closed_day_2, v.closed_day_3,
        v.closed_day_4, v.closed_day_5, v.closed_day_6
      FROM venue_favorites vf
      INNER JOIN venues v ON v.id = vf.venue_id
      LEFT JOIN users u ON u.id = v.owner_id
      LEFT JOIN pitches p ON p.venue_id = v.id
      WHERE vf.user_id = ${userId}
        AND v.is_approved = true
      GROUP BY v.id, u.id, vf.created_at
      ORDER BY vf.created_at DESC, v.name ASC
    `);
    return res as unknown as Record<string, unknown>[];
  }

  /** Idempotent favorite. `created` is true only when a row was inserted. */
  async addFavorite(userId: string, venueId: string): Promise<FavoriteMutationResult> {
    // PR-Agent run-#109: is_approved required — a 404-vs-success split on
    // unapproved ids would let any authed user enumerate the unapproved
    // catalog; and favoriting an unapproved venue would strand the id in the
    // ids list while the list query (is_approved=true) drops it.
    //
    // Run #111 (Reviewer A IMPORTANT): the check and the insert share ONE
    // transaction with a FOR UPDATE row lock on the venue row — run as two
    // bare statements, a venue unapproved between them left an ORPHAN
    // favorite row that BOTH list queries (join venues.is_approved = true)
    // never return: an invisible heart the UI cannot even un-favorite.
    // The lock serializes against admin unapprove (admin/venues transfer
    // pattern, :241) so the approval state cannot flip mid-transaction.
    return this.db.transaction(async (tx) => {
      const [venue] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.id, venueId), eq(venues.is_approved, true)))
        .for('update')
        .limit(1);
      if (!venue) {
        throw new NotFoundException(`Venue ${venueId} not found.`);
      }

      const inserted = await tx
        .insert(venue_favorites)
        .values({ user_id: userId, venue_id: venueId })
        .onConflictDoNothing()
        .returning({ venue_id: venue_favorites.venue_id });

      return { favorited: true, created: inserted.length > 0 };
    });
  }

  /** Idempotent unfavorite. Never 404s on a missing row (mirror of unblock). */
  async removeFavorite(userId: string, venueId: string): Promise<FavoriteMutationResult> {
    const deleted = await this.db
      .delete(venue_favorites)
      .where(
        and(eq(venue_favorites.user_id, userId), eq(venue_favorites.venue_id, venueId)),
      )
      .returning({ venue_id: venue_favorites.venue_id });

    return { favorited: false, removed: deleted.length > 0 };
  }

  // ── P1-55: booking-verified venue reviews (run #117) ────────────────────
  // The verified-booking predicate is the SINGLE source of truth for both the
  // 403 on submit and the GET's can_review flag (the UI CTA must never claim
  // eligibility the server would refuse). A review's match_id is a PROOF ID
  // only — no FK, so match purge/cancel flows can never cascade-delete
  // historical reviews (P2-47 decision pending).

  /** TRUE when the user has ≥1 Completed match at this venue (any pitch).
   *  Returns the LATEST completed match id — stored as the review's proof. */
  private async verifiedBooking(
    userId: string,
    venueId: string,
  ): Promise<string | null> {
    const res = await this.db.execute(sql`
      SELECT m.id
      FROM matches m
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN match_players mp ON mp.match_id = m.id AND mp.user_id = ${userId}
      WHERE p.venue_id = ${venueId}
        AND m.status = 'Completed'
      ORDER BY m.completed_at DESC NULLS LAST, m.scheduled_at DESC
      LIMIT 1
    `);
    const rows = res as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  /**
   * Submit (or re-submit) a review. Re-submission UPSERTs — UNIQUE
   * (venue_id, user_id), latest verdict wins. The aggregate recompute and the
   * write share ONE transaction guarded by FOR UPDATE on the venue row, so
   * two concurrent submissions serialize (mirrors addFavorite's lock pattern,
   * run #111) and rating_avg/rating_count can never drift from the rows.
   */
  async submitVenueReview(
    userId: string,
    venueId: string,
    rating: number,
    comment: string | null,
  ): Promise<ReviewMutationResult> {
    return this.db.transaction(async (tx) => {
      // Lock the venue row: serializes concurrent aggregates + 404s unknown
      // ids (UuidParamPipe has already shape-checked the id).
      const [venue] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.id, venueId))
        .for('update')
        .limit(1);
      if (!venue) {
        throw new NotFoundException(`Venue ${venueId} not found.`);
      }

      const proofMatchId = await this.verifiedBookingTx(tx, userId, venueId);
      if (!proofMatchId) {
        throw new ForbiddenException(
          'Only players who completed a game at this venue can review it.',
        );
      }

      // Upsert — one review per (venue, user); updated_at rides the table's
      // $onUpdateFn. comment explicitly NULLable (isNull on update set).
      const [row] = await tx
        .insert(venue_reviews)
        .values({
          venue_id: venueId,
          user_id: userId,
          match_id: proofMatchId,
          rating,
          comment: comment ?? null,
        })
        .onConflictDoUpdate({
          target: [venue_reviews.venue_id, venue_reviews.user_id],
          set: {
            rating,
            comment: comment ?? null,
            match_id: proofMatchId,
            updated_at: new Date(),
          },
        })
        .returning();

      // Recompute aggregates from the rows inside the same tx.
      const [agg] = await tx
        .select({
          average: sql<string>`COALESCE(round(AVG(${venue_reviews.rating})::numeric, 1), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(venue_reviews)
        .where(eq(venue_reviews.venue_id, venueId));

      await tx
        .update(venues)
        .set({ rating_avg: Number(agg.average), rating_count: agg.count })
        .where(eq(venues.id, venueId));

      return {
        review: {
          ...row,
          rating: Number(row.rating),
        },
        venueRating: { average: Number(agg.average), count: agg.count },
      };
    });
  }

  /** tx-scoped verified-booking probe (runs inside the submit transaction). */
  private async verifiedBookingTx(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    userId: string,
    venueId: string,
  ): Promise<string | null> {
    const res = await tx.execute(sql`
      SELECT m.id
      FROM matches m
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN match_players mp ON mp.match_id = m.id AND mp.user_id = ${userId}
      WHERE p.venue_id = ${venueId}
        AND m.status = 'Completed'
      ORDER BY m.completed_at DESC NULLS LAST, m.scheduled_at DESC
      LIMIT 1
    `);
    const rows = res as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  /** Public reviews page for a venue: latest 20 + aggregates + can_review.
   *  userId is ALWAYS a defined jwt sub — the class-level JwtCookieAuthGuard
   *  on VenuesController precedes this route (guest calls 401, never reach
   *  here), and the PWA hook is enabled only for signed-in users — so the
   *  `(vr.user_id = ${userId})` bind can never be NULL/undefined. */
  async listVenueReviews(userId: string, venueId: string) {
    const res = await this.db.execute(sql`
      SELECT
        vr.id, vr.rating, vr.comment, vr.created_at, vr.updated_at,
        u.id AS user_id, u.full_name AS user_full_name, u.avatar_url AS user_avatar_url,
        (vr.user_id = ${userId}) AS mine
      FROM venue_reviews vr
      LEFT JOIN users u ON u.id = vr.user_id
      WHERE vr.venue_id = ${venueId}
      ORDER BY vr.updated_at DESC
      LIMIT 20
    `);
    const rows = res as unknown as Array<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      updated_at: string;
      user_id: string;
      user_full_name: string | null;
      user_avatar_url: string | null;
      mine: boolean;
    }>;

    const [venue] = await this.db
      .select({ average: venues.rating_avg, count: venues.rating_count })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} not found.`);
    }

    const canReview = await this.verifiedBooking(userId, venueId);

    return {
      reviews: rows.map((r) => ({
        id: r.id,
        rating: Number(r.rating),
        comment: r.comment,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: {
          id: r.user_id,
          full_name: r.user_full_name,
          avatar_url: r.user_avatar_url,
        },
        mine: r.mine,
      })),
      average: Number(venue.average),
      count: venue.count,
      can_review: canReview !== null,
    };
  }
}
