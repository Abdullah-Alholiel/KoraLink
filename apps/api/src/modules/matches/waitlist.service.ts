import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { ActivitiesService } from '../activities/activities.service';
import { AppGateway } from '../gateway/app.gateway';

type DB = PostgresJsDatabase<typeof schema>;
/** Tx handle carried into promoteNextInTx (must share the caller's transaction). */
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export interface WaitlistPromotion {
  userId: string;
  previousPosition: number;
  matchTitle: string;
}

/**
 * FIFO waitlist for full matches (board P1-17).
 *
 * Invariants:
 * - positions are dense 1..N per match, resequenced inside the caller's tx
 *   (the (match_id, position) unique index is DEFERRABLE — migration 0034);
 * - a spot freed from a FULL match is offered to the queue head ATOMICALLY:
 *   promotion runs inside the SAME transaction that flips Full→Open, so a
 *   crash can never leave a free spot and a stale queue (crash-permanence rule);
 * - notifications happen AFTER commit, fire-and-forget (activities pattern).
 */
@Injectable()
export class MatchWaitlistService {
  private readonly logger = new Logger(MatchWaitlistService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly activities: ActivitiesService,
    private readonly appGateway: AppGateway,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────────

  /** The viewer's queue position, or null when not queued. */
  async getPosition(matchId: string, userId: string): Promise<number | null> {
    const [entry] = await this.db
      .select({ position: schema.match_waitlist.position })
      .from(schema.match_waitlist)
      .where(
        sql`${schema.match_waitlist.match_id} = ${matchId} AND ${schema.match_waitlist.user_id} = ${userId}`,
      )
      .limit(1);
    return entry?.position ?? null;
  }

  /**
   * Snapshot. The host sees the full queue; everyone else sees only the count
   * and their own entry (same privacy standard as DM participants).
   */
  async list(matchId: string, viewerId: string) {
    const [match] = await this.db
      .select({ host_id: schema.matches.host_id })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    const rows = await this.db
      .select({
        userId: schema.match_waitlist.user_id,
        fullName: schema.users.full_name,
        avatarUrl: schema.users.avatar_url,
        joinedAt: schema.match_waitlist.created_at,
      })
      .from(schema.match_waitlist)
      .innerJoin(schema.users, eq(schema.users.id, schema.match_waitlist.user_id))
      .where(eq(schema.match_waitlist.match_id, matchId))
      .orderBy(asc(schema.match_waitlist.position));

    const isHost = match.host_id === viewerId;
    const yourIndex = rows.findIndex((r) => r.userId === viewerId);

    const shaped = rows.map((r, i) => ({
      position: i + 1,
      userId: r.userId,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      joinedAt: r.joinedAt,
      isYou: r.userId === viewerId,
    }));

    return {
      count: rows.length,
      yourPosition: yourIndex >= 0 ? yourIndex + 1 : null,
      queue: isHost ? shaped : shaped.filter((r) => r.isYou),
    };
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  /** Queue for a FULL match. Returns the 1-based FIFO position. */
  async join(userId: string, matchId: string): Promise<{ position: number }> {
    const position = await this.db.transaction(async (tx) => {
      // Lock order: matches row first (same as join/leave/cancel — P2-49).
      await tx.execute(
        sql`SELECT id FROM matches WHERE id = ${matchId}::text FOR UPDATE`,
      );

      const [match] = await tx
        .select({
          id: schema.matches.id,
          status: schema.matches.status,
          max_players: schema.matches.max_players,
          host_id: schema.matches.host_id,
          roster: sql<number>`(SELECT COUNT(*)::int FROM ${schema.match_players} mp WHERE mp.match_id = ${schema.matches.id})`,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }
      if (match.host_id === userId) {
        throw new BadRequestException(
          'The host is already in the match — no waitlist needed.',
        );
      }
      if (match.status !== 'Open' && match.status !== 'Full') {
        throw new BadRequestException(
          'This match is no longer accepting waitlist entries.',
        );
      }
      if (match.status === 'Open' && match.roster < match.max_players) {
        throw new ConflictException(
          'Match has open spots — join directly instead.',
        );
      }

      const [rostered] = await tx
        .select({ id: schema.match_players.id })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.user_id} = ${userId}`,
        )
        .limit(1);
      if (rostered) {
        throw new ConflictException('You are already a player in this match.');
      }

      const [queued] = await tx
        .select({ id: schema.match_waitlist.id })
        .from(schema.match_waitlist)
        .where(
          sql`${schema.match_waitlist.match_id} = ${matchId} AND ${schema.match_waitlist.user_id} = ${userId}`,
        )
        .limit(1);
      if (queued) {
        throw new ConflictException('You are already on the waitlist.');
      }

      const [{ nextPos }] = await tx
        .select({
          nextPos: sql<number>`COALESCE(MAX(${schema.match_waitlist.position}), 0)::int + 1`,
        })
        .from(schema.match_waitlist)
        .where(eq(schema.match_waitlist.match_id, matchId));

      await tx
        .insert(schema.match_waitlist)
        .values({ match_id: matchId, user_id: userId, position: nextPos });

      return nextPos;
    });

    return { position };
  }

  /** Leave the queue; remaining positions stay dense 1..N. */
  async leave(userId: string, matchId: string): Promise<{ message: string }> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM matches WHERE id = ${matchId}::text FOR UPDATE`,
      );

      const [entry] = await tx
        .select({ id: schema.match_waitlist.id })
        .from(schema.match_waitlist)
        .where(
          sql`${schema.match_waitlist.match_id} = ${matchId} AND ${schema.match_waitlist.user_id} = ${userId}`,
        )
        .limit(1);
      if (!entry) {
        throw new NotFoundException('You are not on the waitlist for this match.');
      }

      await tx.delete(schema.match_waitlist).where(eq(schema.match_waitlist.id, entry.id));
      await this.resequenceInTx(tx, matchId);
    });

    return { message: 'Left the waitlist.' };
  }

  /**
   * Promote the queue head into a freed roster spot. MUST be awaited inside
   * the SAME transaction that freed the spot (leaveMatch / removePlayer) —
   * never call this with the root db handle. Skips stale entries (players
   * already rostered through another path) and returns the promotion payload
   * for post-commit notification, or null when nothing was promotable.
   */
  async promoteNextInTx(tx: Tx, matchId: string): Promise<WaitlistPromotion | null> {
    for (;;) {
      const [head] = await tx
        .select({
          id: schema.match_waitlist.id,
          user_id: schema.match_waitlist.user_id,
          position: schema.match_waitlist.position,
        })
        .from(schema.match_waitlist)
        .where(eq(schema.match_waitlist.match_id, matchId))
        .orderBy(asc(schema.match_waitlist.position))
        .limit(1)
        .for('update');
      if (!head) return null;

      // Spot actually free? (defensive: the caller just freed one, but a
      // concurrent path in the same tx may have taken it.)
      const [match] = await tx
        .select({
          title: schema.matches.title,
          max_players: schema.matches.max_players,
          roster: sql<number>`(SELECT COUNT(*)::int FROM ${schema.match_players} mp WHERE mp.match_id = ${schema.matches.id})`,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .limit(1);
      if (!match || match.roster >= match.max_players) return null;

      const [alreadyIn] = await tx
        .select({ id: schema.match_players.id })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.user_id} = ${head.user_id}`,
        )
        .limit(1);
      if (alreadyIn) {
        // Stale queue entry (e.g. removed by the host while queued) — drop
        // and offer the spot to the next player.
        await tx.delete(schema.match_waitlist).where(eq(schema.match_waitlist.id, head.id));
        await this.resequenceInTx(tx, matchId);
        continue;
      }

      // Same balanced-team rule as joinMatch: fill the lighter side.
      const [{ homeCount }] = await tx
        .select({
          homeCount: sql<number>`(COUNT(*) FILTER (WHERE ${schema.match_players.team} = 'Home'))::int`,
        })
        .from(schema.match_players)
        .where(eq(schema.match_players.match_id, matchId));
      const [{ awayCount }] = await tx
        .select({
          awayCount: sql<number>`(COUNT(*) FILTER (WHERE ${schema.match_players.team} = 'Away'))::int`,
        })
        .from(schema.match_players)
        .where(eq(schema.match_players.match_id, matchId));

      await tx.insert(schema.match_players).values({
        match_id: matchId,
        user_id: head.user_id,
        is_host: false,
        team: homeCount <= awayCount ? 'Home' : 'Away',
      });

      await tx.delete(schema.match_waitlist).where(eq(schema.match_waitlist.id, head.id));
      await this.resequenceInTx(tx, matchId);

      // Match refills to capacity — restore the Full status the freeing
      // operation just cleared (premise-predicated: only from Open).
      await tx
        .update(schema.matches)
        .set({ status: 'Full', updated_at: new Date() })
        .where(sql`${schema.matches.id} = ${matchId} AND ${schema.matches.status} = 'Open'`);

      return {
        userId: head.user_id,
        previousPosition: head.position,
        matchTitle: match.title,
      };
    }
  }

  /** Post-commit fan-out: activity record (bell + WS) for the promoted player. */
  async notifyPromotion(promotion: WaitlistPromotion, matchId: string): Promise<void> {
    try {
      await this.activities.record({
        actorId: promotion.userId,
        verb: 'waitlist_promoted',
        matchId,
        subjectId: promotion.userId,
        recipients: [promotion.userId],
        excludeActor: false, // the promoted player IS the recipient
      });
      this.appGateway.broadcastRosterUpdate(matchId, { promoted: promotion.userId });
    } catch (err) {
      this.logger.error(
        `waitlist promotion notify failed (match ${matchId}): ${(err as Error).message}`,
      );
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Dense resequencing; safe inside one tx (deferred unique index). */
  private async resequenceInTx(tx: Tx, matchId: string): Promise<void> {
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at)::int AS rn
        FROM match_waitlist
        WHERE match_id = ${matchId}::text
      )
      UPDATE match_waitlist w
      SET position = r.rn
      FROM ranked r
      WHERE w.id = r.id
    `);
  }
}
