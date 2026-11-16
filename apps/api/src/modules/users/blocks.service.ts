import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { and, eq, desc, or, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users, user_blocks } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

export interface BlockView {
  blockedId: string;
  createdAt: string;
}

export interface UnblockResult {
  blocked: false;
  /** P2-161 rider (run #109): true only when a block row was actually deleted. */
  removed: boolean;
}

/** Stable machine code for a DM send rejected by a block (P1-47 convention). */
export const BLOCKED_BY_RECIPIENT = 'BLOCKED_BY_RECIPIENT';

/**
 * P1-53: user blocks. A block row (blocker_id → blocked_id) is directional for
 * listing/status, but messaging is refused when a block exists in EITHER
 * direction (assertNotBlockedBetween).
 */
@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async block(blockerId: string, blockedId: string): Promise<BlockView> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself.');
    }

    const [target] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, blockedId))
      .limit(1);
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    // Idempotent: the composite PK swallows a duplicate (sequential or
    // concurrent) block; re-read the winner row so the response is stable.
    const [inserted] = await this.db
      .insert(user_blocks)
      .values({ blocker_id: blockerId, blocked_id: blockedId })
      .onConflictDoNothing()
      .returning();

    const row = inserted ?? (await this.findRow(blockerId, blockedId));
    if (!row) {
      // Unblocked between the conflict and the re-read — vanishingly rare.
      throw new NotFoundException('Block not found.');
    }
    if (inserted) {
      this.logger.log(
        { event: 'user_blocked', user_id: blockerId, blocked_id: blockedId },
        'user blocked',
      );
    }
    return { blockedId: row.blocked_id, createdAt: row.created_at.toISOString() };
  }

  async unblock(blockerId: string, blockedId: string): Promise<UnblockResult> {
    const deleted = await this.db
      .delete(user_blocks)
      .where(and(eq(user_blocks.blocker_id, blockerId), eq(user_blocks.blocked_id, blockedId)))
      .returning({ blocked_id: user_blocks.blocked_id });
    return { blocked: false, removed: deleted.length > 0 };
  }

  async listBlocked(userId: string): Promise<BlockView[]> {
    const rows = await this.db
      .select({ blocked_id: user_blocks.blocked_id, created_at: user_blocks.created_at })
      .from(user_blocks)
      .where(eq(user_blocks.blocker_id, userId))
      .orderBy(desc(user_blocks.created_at));
    return rows.map((r) => ({ blockedId: r.blocked_id, createdAt: r.created_at.toISOString() }));
  }

  /** Does `a` block `b`? */
  async isBlockedBy(a: string, b: string): Promise<boolean> {
    return !!(await this.findRow(a, b));
  }

  /**
   * Throws 403 `BLOCKED_BY_RECIPIENT` when a block exists in either direction
   * between sender and recipient. One PK/index-backed lookup, LIMIT 1.
   */
  async assertNotBlockedBetween(senderId: string, recipientId: string): Promise<void> {
    const [hit] = await this.db
      .select({ blocker_id: user_blocks.blocker_id })
      .from(user_blocks)
      .where(
        or(
          and(eq(user_blocks.blocker_id, senderId), eq(user_blocks.blocked_id, recipientId)),
          and(eq(user_blocks.blocker_id, recipientId), eq(user_blocks.blocked_id, senderId)),
        ),
      )
      .limit(1);
    if (hit) {
      throw new ForbiddenException({
        message: 'You can no longer message this user.',
        code: BLOCKED_BY_RECIPIENT,
      });
    }
  }

  /**
   * P2-241 (Reviewer A run #153): set-based form of assertNotBlockedBetween —
   * ONE query covers the sender against EVERY other participant, so the
   * sendMessage block gate stops being an N-query loop inside the tx when
   * group conversations land (1:1 today: identical verdict + 403 contract).
   * The ANY-direction predicate mirrors the pairwise method exactly
   * ((sender→other) OR (other→sender) for each other).
   */
  async assertNotBlockedBetweenMany(senderId: string, otherIds: string[]): Promise<void> {
    if (otherIds.length === 0) return;
    const hits = await this.db
      .select({ blocker_id: user_blocks.blocker_id, blocked_id: user_blocks.blocked_id })
      .from(user_blocks)
      .where(
        or(
          and(eq(user_blocks.blocker_id, senderId), inArray(user_blocks.blocked_id, otherIds)),
          and(inArray(user_blocks.blocker_id, otherIds), eq(user_blocks.blocked_id, senderId)),
        ),
      )
      .limit(1);
    if (hits.length > 0) {
      throw new ForbiddenException({
        message: 'You can no longer message this user.',
        code: BLOCKED_BY_RECIPIENT,
      });
    }
  }

  private async findRow(blockerId: string, blockedId: string) {
    const [row] = await this.db
      .select({ blocked_id: user_blocks.blocked_id, created_at: user_blocks.created_at })
      .from(user_blocks)
      .where(and(eq(user_blocks.blocker_id, blockerId), eq(user_blocks.blocked_id, blockedId)))
      .limit(1);
    return row;
  }
}
