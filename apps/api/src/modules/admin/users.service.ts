import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL, and, desc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserAdminDto } from './dto/update-user.dto';
import { AuditService } from './audit.service';

type DB = PostgresJsDatabase<typeof schema>;

const userColumns = {
  id: users.id,
  phone: users.phone,
  full_name: users.full_name,
  handle: users.handle,
  avatar_url: users.avatar_url,
  role: users.role,
  wallet_balance: users.wallet_balance,
  karma_score: users.karma_score,
  rating: users.rating,
  no_show_count: users.no_show_count,
  banned_at: users.banned_at,
  suspended_until: users.suspended_until,
  verification_status: users.verification_status,
  last_seen_at: users.last_seen_at,
  created_at: users.created_at,
};

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
  ) {}

  private buildWhere(dto: ListUsersDto): SQL | undefined {
    const conds: SQL[] = [];

    if (dto.search) {
      const q = `%${dto.search.trim()}%`;
      conds.push(
        sql`(${users.full_name} ILIKE ${q} OR ${users.phone} ILIKE ${q} OR ${users.handle} ILIKE ${q})`,
      );
    }
    if (dto.role) conds.push(eq(users.role, dto.role));

    if (dto.status === 'banned') {
      conds.push(sql`${users.banned_at} IS NOT NULL`);
    } else if (dto.status === 'suspended') {
      conds.push(sql`${users.suspended_until} IS NOT NULL AND ${users.suspended_until} > now()`);
    } else if (dto.status === 'active') {
      conds.push(
        sql`${users.banned_at} IS NULL AND (${users.suspended_until} IS NULL OR ${users.suspended_until} <= now())`,
      );
    }

    return conds.length ? and(...conds) : undefined;
  }

  async list(dto: ListUsersDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where = this.buildWhere(dto);

    const [rows, totalRows] = await Promise.all([
      this.db.select(userColumns).from(users).where(where).orderBy(desc(users.created_at)).limit(perPage).offset((page - 1) * perPage),
      this.db.select({ c: sql<number>`count(*)::int` }).from(users).where(where),
    ]);

    return { users: rows, total: totalRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const [user] = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const [{ matchesPlayed }] = await this.db.execute(sql`
      SELECT COUNT(*)::int AS "matchesPlayed"
      FROM match_players mp
      INNER JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = ${id}::text AND m.status = 'Completed'
    `) as unknown as Array<{ matchesPlayed: number }>;

    const [{ totalSpent }] = await this.db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::float AS "totalSpent"
      FROM transactions
      WHERE user_id = ${id}::text AND type = 'DEBIT' AND status = 'Completed'
    `) as unknown as Array<{ totalSpent: number }>;

    return { ...user, matchesPlayed: matchesPlayed ?? 0, totalSpent: totalSpent ?? 0 };
  }

  async update(id: string, dto: UpdateUserAdminDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    const updates: {
      role?: 'Player' | 'VenueOwner' | 'Admin';
      banned_at?: Date | null;
      suspended_until?: Date | null;
    } = {};

    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.banned !== undefined) updates.banned_at = dto.banned ? new Date() : null;
    if (dto.suspendedUntil !== undefined) {
      updates.suspended_until = dto.suspendedUntil ? new Date(dto.suspendedUntil) : null;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No changes provided.');
    }

    await this.db
      .update(users)
      .set(withTimestamp(updates))
      .where(eq(users.id, id));

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      before,
      after,
      ip,
    });

    return after;
  }
}
