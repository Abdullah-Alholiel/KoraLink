import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { venue_reviews } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { AuditService } from './audit.service';
import { ListVenueReviewsDto } from './dto/list-venue-reviews.dto';

type DB = PostgresJsDatabase<typeof schema>;

/** Every moderation mutation returns exactly this row. */
export interface VenueReviewRow {
  id: string;
  venue_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  hidden_at: Date | null;
  updated_at: Date;
}

export interface VenueReviewListItem {
  id: string;
  venue_id: string;
  venue_name: string;
  user_id: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueReviewListResponse {
  reviews: VenueReviewListItem[];
  total: number;
  page: number;
  perPage: number;
}

const REVIEW_COLUMNS = {
  id: venue_reviews.id,
  venue_id: venue_reviews.venue_id,
  user_id: venue_reviews.user_id,
  rating: venue_reviews.rating,
  comment: venue_reviews.comment,
  hidden_at: venue_reviews.hidden_at,
  updated_at: venue_reviews.updated_at,
};

/**
 * P2-291: admin moderation of venue reviews. Hiding only removes a row from
 * the public list — venues.rating_avg / rating_count are deliberately NOT
 * recomputed here (documented follow-up), and hide/restore/delete leave them
 * untouched until the next player submission recomputes them from the rows.
 */
@Injectable()
export class AdminReviewsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListVenueReviewsDto): Promise<VenueReviewListResponse> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 25;

    const conditions: SQL[] = [];
    if (dto.venueId) conditions.push(sql`vr.venue_id = ${dto.venueId}`);
    if (dto.hidden === 'true') conditions.push(sql`vr.hidden_at IS NOT NULL`);
    if (dto.hidden === 'false') conditions.push(sql`vr.hidden_at IS NULL`);
    const where = conditions.length
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        vr.id, vr.venue_id, v.name AS venue_name,
        vr.user_id, u.full_name AS author_name,
        vr.rating, vr.comment, vr.hidden_at, vr.created_at, vr.updated_at
      FROM venue_reviews vr
      INNER JOIN venues v ON v.id = vr.venue_id
      LEFT JOIN users u ON u.id = vr.user_id
      ${where}
      ORDER BY vr.updated_at DESC, vr.id DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as VenueReviewListItem[];

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM venue_reviews vr ${where}
    `)) as unknown as Array<{ c: number }>;

    return {
      reviews: rows.map((r) => ({ ...r, rating: Number(r.rating) })),
      total: countRows[0]?.c ?? 0,
      page,
      perPage,
    };
  }

  hide(id: string, adminId: string, ip?: string): Promise<VenueReviewRow> {
    return this.setHidden(id, true, adminId, ip);
  }

  restore(id: string, adminId: string, ip?: string): Promise<VenueReviewRow> {
    return this.setHidden(id, false, adminId, ip);
  }

  /**
   * Guarded write: the predicate makes the transition exact-once, so a second
   * (or concurrent) call matches 0 rows and returns the current row WITHOUT a
   * duplicate audit entry. The audit row commits with the mutation.
   */
  private setHidden(
    id: string,
    hidden: boolean,
    adminId: string,
    ip?: string,
  ): Promise<VenueReviewRow> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(venue_reviews)
        .set(withTimestamp({ hidden_at: hidden ? sql`now()` : null }))
        .where(
          and(
            eq(venue_reviews.id, id),
            hidden ? isNull(venue_reviews.hidden_at) : isNotNull(venue_reviews.hidden_at),
          ),
        )
        .returning(REVIEW_COLUMNS);

      if (!updated) {
        const [current] = await tx
          .select(REVIEW_COLUMNS)
          .from(venue_reviews)
          .where(eq(venue_reviews.id, id))
          .limit(1);
        if (!current) {
          throw new NotFoundException('Review not found.');
        }
        return current;
      }

      await this.audit.log(
        {
          adminId,
          action: hidden ? 'venue_review.hide' : 'venue_review.restore',
          entityType: 'venue_review',
          entityId: id,
          before: { hidden: !hidden },
          after: { hidden, hidden_at: updated.hidden_at },
          ip,
        },
        tx,
      );
      return updated;
    });
  }

  async remove(id: string, adminId: string, ip?: string): Promise<VenueReviewRow> {
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(venue_reviews)
        .where(eq(venue_reviews.id, id))
        .returning(REVIEW_COLUMNS);
      if (!deleted) {
        throw new NotFoundException('Review not found.');
      }

      await this.audit.log(
        {
          adminId,
          action: 'venue_review.delete',
          entityType: 'venue_review',
          entityId: id,
          before: {
            rating: deleted.rating,
            comment: deleted.comment,
            venue_id: deleted.venue_id,
            user_id: deleted.user_id,
          },
          ip,
        },
        tx,
      );
      return deleted;
    });
  }
}
