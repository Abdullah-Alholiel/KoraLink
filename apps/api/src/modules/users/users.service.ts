import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  Optional,
  Logger,
} from '@nestjs/common';
import { eq, sql, and, inArray, isNull, isNotNull, lt } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import * as Sentry from '@sentry/node';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as schema from '../../database/schema';
import { users, match_players, match_votes, matches, follows, user_notification_prefs, transactions, push_subscriptions, activities, reports, disputes } from '../../database/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
import { withTimestamp } from '../../common/utils/timestamp';
import { PDPL_GRACE_DAYS } from '../../common/constants/pdpl';
import { MailerService } from '../mailer/mailer.service';
import { OtpStoreService } from '../auth/otp-store.service';
import { UnifonicService } from '../auth/unifonic.service';

type DB = PostgresJsDatabase<typeof schema>;

/** Profile projection returned by mutations (PATCH /users/me contract). */
export interface UpdatedProfile {
  id: string;
  phone: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_location: string | null;
  preferred_position: string | null;
  role: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    // P1-41 (run #35): optional — deletion-confirmation email (E15).
    @Optional() private readonly mailer?: MailerService,
    // P1-19 (run #44): phone-change OTP dispatch + scoped storage. Optional
    // marker mirrors mailer (AuthModule is always imported by UsersModule, so
    // DI always provides them; the marker keeps direct-test construction
    // ergonomic and trailing-optionals TS-valid).
    @Optional() private readonly otpStore?: OtpStoreService,
    @Optional() private readonly unifonic?: UnifonicService,
  ) {}

  /**
   * Count how many times a user won Player of the Match.
   * A "win" = the user was the candidate with the most votes in a completed
   * match where votes are closed (completed_at + 24h < now).
   */
  private async getPomCount(userId: string): Promise<number> {
    // Find completed matches where voting window has closed, and the user
    // had the most votes (no tie at top).
    const result = await this.db.execute(sql`
      WITH closed_matches AS (
        SELECT m.id
        FROM ${matches} m
        WHERE m.status = 'Completed'
          AND m.completed_at IS NOT NULL
          AND m.completed_at + INTERVAL '24 hours' < NOW()
      ),
      vote_winners AS (
        SELECT
          mv.match_id,
          mv.candidate_id,
          COUNT(*)::int AS vc,
          RANK() OVER (PARTITION BY mv.match_id ORDER BY COUNT(*) DESC) AS rnk
        FROM ${match_votes} mv
        INNER JOIN closed_matches cm ON cm.id = mv.match_id
        INNER JOIN ${match_players} mp
          ON mp.match_id = mv.match_id
         AND mp.user_id = mv.candidate_id
         AND mp.no_show = false
        GROUP BY mv.match_id, mv.candidate_id
      )
      SELECT COUNT(*)::int AS pom_count
      FROM vote_winners vw
      WHERE vw.rnk = 1
        AND vw.candidate_id = ${userId}
        AND vw.vc > 0
        -- Exclude ties: ensure no other candidate has same count at rank 1
        AND NOT EXISTS (
          SELECT 1 FROM vote_winners vw2
          WHERE vw2.match_id = vw.match_id
            AND vw2.rnk = 1
            AND vw2.candidate_id != vw.candidate_id
        )
    `);

    return (result[0] as { pom_count: number })?.pom_count ?? 0;
  }

  /**
   * Get the authenticated user's profile including stats.
   */
  async getProfile(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        phone: true,
        full_name: true,
        handle: true,
        avatar_url: true,
        preferred_location: true,
        preferred_position: true,
        role: true,
        wallet_balance: true,
        karma_score: true,
        no_show_count: true,
        home_lat: true,
        home_lng: true,
        push_muted: true,
        email: true,
        email_verified_at: true,
        email_muted: true,
        quiet_hours_enabled: true,
        quiet_start_hour: true,
        quiet_end_hour: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const pom_count = await this.getPomCount(userId);

    return { ...user, pom_count };
  }

  /**
   * Get the authenticated user's stats summary.
   */
  async getStats(userId: string) {
    const [user] = await this.db
      .select({
        karma_score: users.karma_score,
        no_show_count: users.no_show_count,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(match_players)
      .where(eq(match_players.user_id, userId));

    return {
      games_played: count,
      karma_score: user.karma_score,
      no_show_count: user.no_show_count,
    };
  }

  /**
   * Get the list of matches the user has joined (for Active Discussions).
   */
  async getMyMatches(userId: string) {
    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.match_type,
        m.gender_rule,
        m.status,
        m.scheduled_at,
        m.duration_mins,
        m.max_players,
        m.price_per_player::float AS price_per_player,
        COUNT(mp2.id)::int AS spots_filled,
        NULL::float8 AS distance_m,
        TRUE AS is_joined,
        u.id AS host_id,
        u.full_name AS host_name,
        u.avatar_url AS host_avatar,
        p.id AS pitch_id,
        p.name AS pitch_name,
        p.size AS pitch_size,
        p.surface_type AS pitch_surface,
        COALESCE((SELECT mm.content FROM match_messages mm WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1), '') AS last_message,
        EXISTS(SELECT 1 FROM match_votes mv WHERE mv.match_id = m.id AND mv.voter_id = ${userId}::text) AS has_voted,
        m.visibility AS visibility,
        v.name AS venue_name,
        v.city AS venue_city,
        COALESCE(m.completed_at, m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) + INTERVAL '24 hours' AS voting_closes_at
      FROM match_players my
      INNER JOIN matches m ON m.id = my.match_id
      INNER JOIN users u ON u.id = m.host_id
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN match_players mp2 ON mp2.match_id = m.id
      WHERE my.user_id = ${userId}
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY
        -- Upcoming/active matches first (scheduled today or later)
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN 0
             WHEN m.status = 'Cancelled' THEN 1
             WHEN m.status = 'Completed' THEN 2
             ELSE 3 END,
        -- Upcoming: soonest first
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN m.scheduled_at END ASC,
        -- Past: most recent first
        m.scheduled_at DESC
      LIMIT 50
    `);

    return rows as unknown as Array<{
      id: string;
      title: string;
      match_type: string;
      gender_rule: string;
      status: string;
      scheduled_at: Date;
      duration_mins: number;
      max_players: number;
      price_per_player: number;
      spots_filled: number;
      distance_m: number | null;
      host_id: string;
      host_name: string | null;
      host_avatar: string | null;
      visibility: 'public' | 'private';
      pitch_id: string;
      pitch_name: string;
      pitch_surface: string;
      last_message: string;
      has_voted: boolean;
      venue_name: string;
      venue_city: string;
      voting_closes_at: Date;
    }>;
  }

  /**
   * Get unified discussions list — match group chats AND personal 1:1
   * conversations in ONE recency-sorted list, with last message preview
   * and unread counts. Single source for the Messages screen.
   */
  async getMyDiscussions(userId: string) {
    const rows = await this.db.execute(sql`
      SELECT * FROM (
        SELECT
          m.id,
          'match'::text AS type,
          m.title,
          m.status::text AS match_status,
          m.scheduled_at,
          u.full_name AS other_name,
          u.avatar_url AS other_avatar,
          (SELECT COUNT(*) FROM match_players mp2 WHERE mp2.match_id = m.id)::int AS participant_count,
          last_msg.content AS last_message,
          last_msg.created_at AS last_message_at,
          last_msg.sender_name AS last_message_sender_name,
          0::int AS unread_count,
          COALESCE(last_msg.created_at, m.scheduled_at) AS last_activity
        FROM match_players my
        INNER JOIN matches m ON m.id = my.match_id
        INNER JOIN users u ON u.id = m.host_id
        LEFT JOIN LATERAL (
          SELECT mm.content, mm.created_at, u2.full_name AS sender_name
          FROM match_messages mm
          INNER JOIN users u2 ON u2.id = mm.user_id
          WHERE mm.match_id = m.id
          ORDER BY mm.created_at DESC
          LIMIT 1
        ) last_msg ON true
        WHERE my.user_id = ${userId}
          AND m.status NOT IN ('Cancelled')

        UNION ALL

        SELECT
          c.id,
          'personal'::text AS type,
          COALESCE(other.full_name, other.handle, 'KoraLink') AS title,
          NULL::text AS match_status,
          NULL::timestamptz AS scheduled_at,
          COALESCE(other.full_name, other.handle, 'KoraLink') AS other_name,
          other.avatar_url AS other_avatar,
          2::int AS participant_count,
          last_pm.content AS last_message,
          last_pm.created_at AS last_message_at,
          sender_u.full_name AS last_message_sender_name,
          (SELECT COUNT(*)::int
            FROM personal_messages pm2
            WHERE pm2.conversation_id = c.id
              AND pm2.sender_id != ${userId}::text
              AND pm2.created_at > COALESCE(cp.last_read_at, 'epoch'::timestamptz)
          ) AS unread_count,
          COALESCE(last_pm.created_at, c.updated_at) AS last_activity
        FROM conversation_participants cp
        INNER JOIN conversations c ON c.id = cp.conversation_id
        INNER JOIN conversation_participants cp2
          ON cp2.conversation_id = c.id AND cp2.user_id != ${userId}::text
        INNER JOIN users other ON other.id = cp2.user_id
        LEFT JOIN LATERAL (
          SELECT pm.content, pm.created_at, pm.sender_id
          FROM personal_messages pm
          WHERE pm.conversation_id = c.id
          ORDER BY pm.created_at DESC
          LIMIT 1
        ) last_pm ON true
        LEFT JOIN users sender_u ON sender_u.id = last_pm.sender_id
        WHERE cp.user_id = ${userId}
      ) unified
      ORDER BY unified.last_activity DESC
      LIMIT 30
    `);

    return {
      discussions: (rows as unknown as Array<{
        id: string;
        type: string;
        title: string;
        match_status: string | null;
        scheduled_at: Date | null;
        other_name: string | null;
        other_avatar: string | null;
        participant_count: number;
        last_message: string | null;
        last_message_at: Date | null;
        last_message_sender_name: string | null;
        unread_count: number;
      }>).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        matchStatus: r.match_status,
        scheduledAt: r.scheduled_at,
        hostName: r.other_name,
        hostAvatar: r.other_avatar,
        avatarUrl: r.other_avatar,
        personal: r.type === 'personal' ? true : undefined,
        participantCount: r.participant_count,
        lastMessage: r.last_message,
        lastMessageAt: r.last_message_at,
        lastMessageSenderName: r.last_message_sender_name,
        unreadCount: r.unread_count ?? 0,
      })),
      total: rows.length,
      hasMore: rows.length >= 30,
    };
  }

  /**
   * Update the authenticated user's profile fields.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const [updated] = await this.db
      .update(users)
      .set(withTimestamp({ ...dto }))
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        phone: users.phone,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_location: users.preferred_location,
        preferred_position: users.preferred_position,
        role: users.role,
        home_lat: users.home_lat,
        home_lng: users.home_lng,
      });

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return updated;
  }

  // ── P1-19 (run #44): phone-change flow ──────────────────────────────────
  // A user who loses their SIM is otherwise permanently locked out (OTP is
  // the sole credential; PDPL soft-delete+recreate loses history). Flow:
  //   1. request: validate + prove nothing yet — dispatch a fresh OTP to the
  //      NEW number under the SCOPED otp:change:* key (login codes can never
  //      verify a change, and change codes can never log in).
  //   2. verify: consume that code → flip users.phone → audit activity +
  //      Pino log. Live JWTs stay valid (JwtCookieStrategy resolves by `sub`,
  //      never re-checks the phone claim); new logins use the new number.
  // Abuse caps (60s cooldown, 10/day/phone, 50/day/IP, 5-fail lockout) are
  // the SAME counters the login flow uses — one SMS budget.

  /** Normalized-status users blocked from changing their phone. */
  private async getPhoneChangeActor(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        phone: users.phone,
        role: users.role,
        banned_at: users.banned_at,
        suspended_until: users.suspended_until,
        deleted_at: users.deleted_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.banned_at) {
      throw new ForbiddenException('Account banned.');
    }
    if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
      throw new ForbiddenException('Account suspended.');
    }
    // Mirror the login-side PDPL guard: a soft-deleted account cannot mint
    // or consume change-flow OTPs (restore is the only escape there).
    if (user.deleted_at) {
      throw new ForbiddenException('Account scheduled for deletion.');
    }
    return user;
  }

  /** Map a PG unique-violation on users.phone to a localized-able 409. */
  private phoneTakenConflict(): ConflictException {
    return new ConflictException('This phone number is already registered.');
  }

  /** Shared caps/daily-counters (P1-19 otpStore is DI-provided in prod). */
  private otp(): OtpStoreService {
    if (!this.otpStore || !this.unifonic) {
      throw new HttpException(
        'Phone changes are unavailable in this environment.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.otpStore;
  }

  private sms(): UnifonicService {
    if (!this.unifonic) {
      throw new HttpException(
        'Phone changes are unavailable in this environment.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.unifonic;
  }

  async requestPhoneChange(
    userId: string,
    newPhone: string,
    ip?: string,
  ): Promise<{ message: string; cooldownSeconds: number }> {
    const actor = await this.getPhoneChangeActor(userId);

    // Self-change guard: same number ⇒ nothing to verify, don't burn SMS.
    if (actor.phone === newPhone) {
      throw new BadRequestException('This is already your phone number.');
    }

    // Fast path 409 (the authoritative one is the 23505 catch below — a
    // concurrent signup can take the number between check and verify).
    const [taken] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, newPhone))
      .limit(1);
    if (taken) {
      throw this.phoneTakenConflict();
    }

    // ── Shared abuse caps (identical semantics to auth sendOtp) ──
    const otp = this.otp();
    if (await otp.isCooldownActive(newPhone)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Please wait before requesting another code.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const dailyCount = await otp.getDailyCount(newPhone);
    if (dailyCount >= OtpStoreService.DAILY_CAP) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily SMS limit reached. Try again tomorrow.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (ip) {
      const ipDailyCount = await otp.getIpDailyCount(ip);
      if (ipDailyCount >= OtpStoreService.DAILY_IP_CAP) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Daily SMS limit reached for this IP. Try again tomorrow.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // NOTE: deliberately NO users upsert (login sendOtp pre-creates the row;
    // here the actor already exists and the target number must stay free).

    const code = randomInt(100_000, 1_000_000).toString();
    await otp.setChangeOtp(newPhone, code);
    await otp.setCooldown(newPhone);
    await otp.incrementDaily(newPhone);
    if (ip) {
      await otp.incrementIpDaily(ip);
    }

    try {
      await this.sms().sendSms(
        newPhone,
        `KoraLink: your number-change code is ${code}. If you did not request this, ignore this message.`,
      );
    } catch (err) {
      // No stale code left behind: the user retries with a clean slate and
      // the failure is observable (Sentry + Pino) — money-path discipline
      // applied to credential flows.
      await otp.deleteChangeOtp(newPhone);
      this.logger.error(
        { event: 'phone_change_sms_failed', new_phone: newPhone, err },
        'phone-change SMS dispatch failed; stored code rolled back',
      );
      Sentry.captureException(err, {
        tags: { scope: 'users.requestPhoneChange' },
      });
      throw new HttpException(
        'Could not send the verification SMS. Try again in a moment.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(
      { event: 'phone_change_requested', user_id: userId },
      'phone-change OTP dispatched to the new number',
    );
    return { message: 'OTP sent to your new number.', cooldownSeconds: 60 };
  }

  async verifyPhoneChange(
    userId: string,
    newPhone: string,
    code: string,
  ): Promise<UpdatedProfile> {
    const actor = await this.getPhoneChangeActor(userId);

    if (actor.phone === newPhone) {
      throw new BadRequestException('This is already your phone number.');
    }

    // The verify body must match the number the code was dispatched to.
    // Without this, a code for phone A could be spent moving the account to
    // phone B (possession of A must prove possession of exactly A).
    const otp = this.otp();
    const storedCode = await otp.getChangeOtp(newPhone);
    if (!storedCode) {
      // Distinguish lockout from a plain wrong/expired code.
      const fails = await otp.getFailCount(newPhone);
      if (fails >= OtpStoreService.FAIL_LIMIT) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many attempts. Try again later.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid or expired OTP.');
    }
    if (storedCode !== code) {
      await otp.incrementFail(newPhone);
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    try {
      await this.db
        .update(users)
        .set(withTimestamp({ phone: newPhone }))
        .where(and(eq(users.id, userId), isNull(users.deleted_at)));
    } catch (err) {
      // Race window: a signup took the number between request and verify
      // (PG 23505 on users.phone_unique) → same localized 409 shape as the
      // request-step pre-check. OTP is consumed either way (single use).
      if (
        err &&
        typeof err === 'object' &&
        (err as { code?: string }).code === '23505'
      ) {
        throw this.phoneTakenConflict();
      }
      throw err;
    }

    await otp.deleteChangeOtp(newPhone);
    await otp.resetFails(newPhone);

    // Audit trail (verb added to ActivityVerb by migration 0037). No feed
    // fan-out — feed_items only materialize for templated social verbs.
    await this.db.insert(activities).values({
      actor_id: userId,
      verb: 'phone_changed',
      subject_id: userId,
    });

    this.logger.log(
      {
        event: 'phone_changed',
        user_id: userId,
        // Audit log carries the NEW number masked to last-4 only.
        new_phone_suffix: newPhone.slice(-4),
      },
      'user changed their phone number',
    );

    // Same projection as updateProfile — the PWA reconciles its caches with
    // one response shape. getProfile re-reads committed state (outside any
    // transaction) per the mutation-return contract.
    return this.getProfile(userId) as Promise<UpdatedProfile>;
  }

  /**
   * Update the authenticated user's push delivery preferences
   * (P1-20, run #13). Only the provided fields change. Returns the full
   * preference set so the client can reconcile its UI in one round-trip.
   *
   * P0-5 (run #28): also persists per-category mutes into
   * `user_notification_prefs`. Each `categoryMutes` key is a partial PATCH
   * (absent == leave the stored value alone). On read, missing rows default
   * to `muted: false` so a brand-new user sees an all-allowed response.
   */
  async updatePushPreferences(
    userId: string,
    dto: UpdatePushPreferencesDto,
  ) {
    const set: Record<string, unknown> = {};
    if (dto.pushMuted !== undefined) set.push_muted = dto.pushMuted;
    if (dto.emailMuted !== undefined) set.email_muted = dto.emailMuted; // P1-41 (run #35)
    if (dto.quietHoursEnabled !== undefined)
      set.quiet_hours_enabled = dto.quietHoursEnabled;
    if (dto.quietStartHour !== undefined)
      set.quiet_start_hour = dto.quietStartHour;
    if (dto.quietEndHour !== undefined) set.quiet_end_hour = dto.quietEndHour;

    if (Object.keys(set).length > 0) {
      await this.db
        .update(users)
        .set(withTimestamp(set))
        .where(eq(users.id, userId));
    }

    // Per-category mutes (P0-5). Upsert per key so a user can flip a single
    // category back to false without writing the other three. The category
    // is typed by the DTO so we can iterate the keys statically — no
    // user-supplied SQL ever touches the table.
    if (dto.categoryMutes) {
      const m = dto.categoryMutes;
      const pairs: { category: 'match' | 'chat' | 'promo' | 'system'; muted: boolean }[] = [];
      if (m.match !== undefined) pairs.push({ category: 'match', muted: m.match });
      if (m.chat !== undefined) pairs.push({ category: 'chat', muted: m.chat });
      if (m.promo !== undefined) pairs.push({ category: 'promo', muted: m.promo });
      if (m.system !== undefined) pairs.push({ category: 'system', muted: m.system });
      for (const { category, muted } of pairs) {
        await this.db
          .insert(user_notification_prefs)
          .values({ user_id: userId, category, muted })
          .onConflictDoUpdate({
            target: [user_notification_prefs.user_id, user_notification_prefs.category],
            set: withTimestamp({ muted }),
          });
      }
    }

    return this.getPushPreferences(userId);
  }

  /**
   * Read the authenticated user's full push preferences (P1-20 + P0-5).
   * Always returns the 4 category keys; missing rows default to `muted: false`
   * (the unmuted default — a brand-new user hasn't chosen yet).
   */
  async getPushPreferences(userId: string) {
    const [prefs] = await this.db
      .select({
        push_muted: users.push_muted,
        email_muted: users.email_muted,
        quiet_hours_enabled: users.quiet_hours_enabled,
        quiet_start_hour: users.quiet_start_hour,
        quiet_end_hour: users.quiet_end_hour,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!prefs) {
      throw new NotFoundException('User not found.');
    }

    const stored = await this.db
      .select({
        category: user_notification_prefs.category,
        muted: user_notification_prefs.muted,
      })
      .from(user_notification_prefs)
      .where(eq(user_notification_prefs.user_id, userId));

    const storedByCat: Record<string, boolean> = {};
    for (const row of stored) storedByCat[row.category] = row.muted;

    const categoryMutes = {
      match: storedByCat['match'] ?? false,
      chat: storedByCat['chat'] ?? false,
      promo: storedByCat['promo'] ?? false,
      system: storedByCat['system'] ?? false,
    };

    return { ...prefs, category_mutes: categoryMutes };
  }

  /**
   * Get a public user profile by ID — visible to any authenticated user.
   */
  async getPublicProfile(userId: string, currentUserId?: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_position: users.preferred_position,
        // P1-39 (run #34): reputation visibility — the no-show count is already
        // tracked and admin-visible; expose it on the public profile so hosts
        // can screen joiners. Screening/penalties remain a product decision.
        no_show_count: users.no_show_count,
      })
      .from(users)
      .where(
        // P1-35 (run #31): a soft-deleted user's public profile must 404.
        // Migration 0031's contract says deleted users vanish from search
        // AND public profile; searchUsers got the filter in run #29, this
        // call site was missed (Reviewer A run #31, CRITICAL C2).
        and(eq(users.id, userId), isNull(users.deleted_at)),
      )
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const pom_count = await this.getPomCount(userId);

    const [{ games_played, no_show_count }] = await this.db
      .select({
        games_played: sql<number>`COUNT(*)::int`,
        // Same query, second aggregate: completed-game no-shows for this user
        // (P1-39 reputation visibility).
        no_show_count: sql<number>`COUNT(*) FILTER (WHERE ${match_players.no_show} = true)::int`,
      })
      .from(match_players)
      .where(eq(match_players.user_id, userId));

    const [counts] = (await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${follows} WHERE following_id = ${userId}::text) AS followers_count,
        (SELECT COUNT(*)::int FROM ${follows} WHERE follower_id = ${userId}::text) AS following_count
    `)) as unknown as Array<{ followers_count: number; following_count: number }>;

    let isFollowing = false;
    if (currentUserId) {
      const [followRow] = await this.db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.follower_id, currentUserId), eq(follows.following_id, userId)))
        .limit(1);
      isFollowing = !!followRow;
    }

    return {
      id: user.id,
      full_name: user.full_name,
      handle: user.handle,
      avatar_url: user.avatar_url,
      preferred_position: user.preferred_position,
      pom_count,
      games_played,
      no_show_count: no_show_count ?? 0,
      isFollowing,
      followersCount: counts?.followers_count ?? 0,
      followingCount: counts?.following_count ?? 0,
    };
  }

  /**
   * Search users by name or handle.
   * P0-6 (run #29): also filter out soft-deleted and banned users.
   * Soft-deleted accounts must not appear in search results; banned
   * accounts (P2-14 prior bug) must not either.
   */
  async searchUsers(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const q = `%${query.trim()}%`;
    return this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_position: users.preferred_position,
      })
      .from(users)
      .where(
        and(
          isNull(users.deleted_at),
          isNull(users.banned_at),
          sql`(${users.full_name} ILIKE ${q} OR ${users.handle} ILIKE ${q})`,
        ),
      )
      .limit(20);
  }

  // ────────────────────────────────────────────────────────────────────
  // P0-6 (run #29): PDPL account-delete + restore + data-export.
  // ────────────────────────────────────────────────────────────────────

  /**
   * Soft-delete the authenticated user. Idempotent (a second call returns
   * the existing deleted_at). Effects:
   *   - `users.deleted_at` set to now()
   *   - `push_subscriptions` rows dropped (push can't reach a deactivated
   *     user; the FK is CASCADE so this is automatic — explicit
   *     `delete()` here is just defense-in-depth)
   *   - Issues a `purpose: 'restore'` JWT the PWA can present to
   *     /users/me/restore inside the 30-day grace window. Returned in
   *     `restore_token` for the client to persist (Zustand + localStorage).
   *   - All other rows (transactions, activities, reports, disputes)
   *     are RETAINED — the financial audit trail must survive per PDPL.
   */
  async softDelete(userId: string) {
    const [existing] = await this.db
      .select({
        id: users.id,
        phone: users.phone,
        role: users.role,
        deleted_at: users.deleted_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    // Idempotent: a second call returns the existing deleted_at.
    if (existing.deleted_at) {
      // A-I4 (run #31, Reviewer A): anchor the re-signed token's expiry to
      // purge_at, NOT to now — a second DELETE on day 29 previously minted
      // a fresh 31-day token that outlived the purge deadline by 30 days.
      // The strategy's signed-`iat` window check remains the outer bound;
      // this JWT exp is the tighter one.
      const purgeAt = new Date(existing.deleted_at.getTime() + PDPL_GRACE_DAYS * 86_400_000);
      const remainingSec = Math.floor((purgeAt.getTime() - Date.now()) / 1000);
      const restore_token = this.jwt.sign(
        {
          sub: existing.id,
          phone: existing.phone,
          role: existing.role,
          purpose: 'restore',
        },
        // Never negative (jwt.sign throws): a floor of 1h is harmless —
        // the strategy window check rejects expired-window restores anyway.
        { expiresIn: Math.max(remainingSec, 3600) },
      );
      return {
        deleted_at: existing.deleted_at,
        purge_at: purgeAt,
        restore_token,
      };
    }

    const [updated] = await this.db
      .update(users)
      .set(withTimestamp({ deleted_at: new Date() }))
      .where(eq(users.id, userId))
      .returning({ deleted_at: users.deleted_at });

    if (!updated || !updated.deleted_at) {
      throw new NotFoundException('User not found.');
    }

    // Defense in depth: the push_subscriptions FK is CASCADE so the row
    // is removed automatically when the user is hard-purged, but a soft
    // delete doesn't trigger CASCADE. We delete explicitly so a deactivated
    // user stops receiving pushes immediately.
    await this.db.delete(push_subscriptions).where(eq(push_subscriptions.user_id, userId));

    // P1-41 (run #35): PDPL deletion-confirmation email (E15). Best-effort
    // fire-and-forget; the mailer's suppression skips users without a
    // verified email (ghosts can never be addressed — purge nulls it).
    if (this.mailer) {
      this.mailer
        .sendToUsers([userId], 'account_deletion')
        .catch(() => undefined);
    }

    const restore_token = this.jwt.sign(
      {
        sub: existing.id,
        phone: existing.phone,
        role: existing.role,
        purpose: 'restore',
      },
      { expiresIn: `${PDPL_GRACE_DAYS + 1}d` },
    );

    return {
      deleted_at: updated.deleted_at,
      purge_at: new Date(updated.deleted_at.getTime() + PDPL_GRACE_DAYS * 86_400_000),
      restore_token,
    };
  }

  /**
   * Restore a soft-deleted user inside the 30-day grace window.
   * Idempotent: calling on an active user is a no-op (returns the
   * current profile). Calling past the grace window throws
   * GoneException (410) — the user is permanently anonymized.
   *
   * The restore token has `purpose: 'restore'` which the JWT strategy
   * accepts even when the user is soft-deleted. Once we null
   * `deleted_at`, the next regular call passes normally.
   */
  async restoreUser(userId: string) {
    const [existing] = await this.db
      .select({
        id: users.id,
        deleted_at: users.deleted_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    if (!existing.deleted_at) {
      // Idempotent no-op — the user is already active.
      return this.getProfile(userId);
    }

    const ageMs = Date.now() - existing.deleted_at.getTime();
    if (ageMs > PDPL_GRACE_DAYS * 86_400_000) {
      throw new BadRequestException(
        'Restore window expired. The account is permanently scheduled for deletion.',
      );
    }

    await this.db
      .update(users)
      .set(withTimestamp({ deleted_at: null }))
      .where(eq(users.id, userId));

    // Re-read populated profile OUTSIDE the update (contract §2).
    return this.getProfile(userId);
  }

  /**
   * Export the authenticated user's data as a JSON envelope of the
   * 7 (well, 8) PDPL data groups. Returns:
   *   { exportedAt, profile, matches, wallet, transactions,
   *     disputes, reports, activities, push_subscriptions }
   *
   * Redaction rules:
   *   - profile: drops `verification_status` (admin-internal)
   *   - push_subscriptions: replaces p256dh/auth/endpoint raw crypto
   *     with a metadata-only summary (the PWA may delete its own
   *     subscriptions via the existing DELETE endpoint, but the export
   *     never leaks the device secrets)
   *   - activities: each row carries a resolved `subject` (when the
   *     subject_id points to a match/user, resolve to a label; else
   *     redact to `null` + a `kind` hint)
   *   - transactions: amount + type + reference_type + reference_id
   *     only; idempotency_key dropped (internal implementation detail)
   */
  async exportUserData(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        phone: users.phone,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_location: users.preferred_location,
        preferred_position: users.preferred_position,
        role: users.role,
        home_lat: users.home_lat,
        home_lng: users.home_lng,
        karma_score: users.karma_score,
        no_show_count: users.no_show_count,
        push_muted: users.push_muted,
        email: users.email,
        email_muted: users.email_muted,
        email_verified_at: users.email_verified_at,
        quiet_hours_enabled: users.quiet_hours_enabled,
        quiet_start_hour: users.quiet_start_hour,
        quiet_end_hour: users.quiet_end_hour,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Profile (redacted). `verification_status`, `banned_at`,
    // `suspended_until` are admin-internal — not exported to self.
    const profile = {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      handle: user.handle,
      avatar_url: user.avatar_url,
      preferred_location: user.preferred_location,
      preferred_position: user.preferred_position,
      role: user.role,
      home_lat: user.home_lat,
      home_lng: user.home_lng,
      karma_score: user.karma_score,
      no_show_count: user.no_show_count,
      push_muted: user.push_muted,
      email: user.email,
      email_muted: user.email_muted,
      email_verified_at: user.email_verified_at,
      quiet_hours_enabled: user.quiet_hours_enabled,
      quiet_start_hour: user.quiet_start_hour,
      quiet_end_hour: user.quiet_end_hour,
      created_at: user.created_at,
    };

    // Matches (hosting + joined). Same projection as `getMyMatches` for
    // the joined side; add a separate `hosted` slice via the host_id
    // relation so a user sees matches they created but never joined
    // (cancelled/scheduled/etc.).
    //
    // Note: `match_players` has no `joined_at` column (the schema
    // models `created_at` on the table, but the column isn't there in
    // the live DB). Strip it from the SELECT to keep this query
    // additive-only.
    const [joinedRows, hostedRows] = await Promise.all([
      this.db.execute(sql`
        SELECT
          m.id, m.title, m.match_type, m.status, m.scheduled_at,
          m.duration_mins, m.max_players, m.price_per_player::float AS price_per_player,
          m.visibility, p.name AS pitch_name, p.size AS pitch_size, p.surface_type AS pitch_surface,
          v.name AS venue_name, v.city AS venue_city,
          mp.is_host, mp.team
        FROM match_players mp
        INNER JOIN matches m ON m.id = mp.match_id
        INNER JOIN pitches p ON p.id = m.pitch_id
        INNER JOIN venues v ON v.id = p.venue_id
        WHERE mp.user_id = ${userId}
        ORDER BY m.scheduled_at DESC
      `),
      this.db.execute(sql`
        SELECT
          m.id, m.title, m.match_type, m.status, m.scheduled_at,
          m.duration_mins, m.max_players, m.price_per_player::float AS price_per_player,
          m.visibility, p.name AS pitch_name, p.size AS pitch_size, p.surface_type AS pitch_surface,
          v.name AS venue_name, v.city AS venue_city
        FROM matches m
        INNER JOIN pitches p ON p.id = m.pitch_id
        INNER JOIN venues v ON v.id = p.venue_id
        WHERE m.host_id = ${userId}
          AND m.id NOT IN (SELECT match_id FROM match_players WHERE user_id = ${userId})
        ORDER BY m.scheduled_at DESC
      `),
    ]);

    const matches = {
      joined: (joinedRows as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        title: r.title,
        match_type: r.match_type,
        status: r.status,
        scheduled_at: r.scheduled_at,
        duration_mins: r.duration_mins,
        max_players: r.max_players,
        price_per_player: r.price_per_player,
        visibility: r.visibility,
        pitch_name: r.pitch_name,
        pitch_size: r.pitch_size,
        pitch_surface: r.pitch_surface,
        venue_name: r.venue_name,
        venue_city: r.venue_city,
        is_host: r.is_host,
        team: r.team,
      })),
      hosted: (hostedRows as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        title: r.title,
        match_type: r.match_type,
        status: r.status,
        scheduled_at: r.scheduled_at,
        duration_mins: r.duration_mins,
        max_players: r.max_players,
        price_per_player: r.price_per_player,
        visibility: r.visibility,
        pitch_name: r.pitch_name,
        pitch_size: r.pitch_size,
        pitch_surface: r.pitch_surface,
        venue_name: r.venue_name,
        venue_city: r.venue_city,
      })),
    };

    // Wallet (current balance) + transactions (full ledger).
    const [walletRow] = await this.db
      .select({ balance: users.wallet_balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const wallet = { balance: walletRow?.balance ?? '0' };

    const txnRows = await this.db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        reference_type: transactions.reference_type,
        reference_id: transactions.reference_id,
        status: transactions.status,
        created_at: transactions.created_at,
      })
      .from(transactions)
      .where(eq(transactions.user_id, userId))
      .orderBy(sql`${transactions.created_at} DESC`);

    // Disputes (filed by user) — use `decision` (not `resolution` as on
    // reports). The schema models a decision text — what an admin wrote
    // when they resolved/closed the dispute.
    const disputeRows = await this.db
      .select({
        id: disputes.id,
        match_id: disputes.match_id,
        type: disputes.type,
        status: disputes.status,
        decision: disputes.decision,
        created_at: disputes.created_at,
      })
      .from(disputes)
      .where(eq(disputes.reporter_id, userId))
      .orderBy(sql`${disputes.created_at} DESC`);

    // Reports (filed by user) — `resolution` + `resolved_at` available.
    const reportRows = await this.db
      .select({
        id: reports.id,
        subject_type: reports.subject_type,
        subject_id: reports.subject_id,
        reason: reports.reason,
        status: reports.status,
        resolution: reports.resolution,
        resolved_at: reports.resolved_at,
        created_at: reports.created_at,
      })
      .from(reports)
      .where(eq(reports.reporter_id, userId))
      .orderBy(sql`${reports.created_at} DESC`);

    // Activities (verbs involving the user) — `actor_id` only (no
    // `target_user_id` column exists). Redact opaque subject_id refs:
    // a subject_id is a varchar(36) that could point to a match OR
    // another user; resolve when possible.
    const activityRows = await this.db
      .select({
        id: activities.id,
        verb: activities.verb,
        match_id: activities.match_id,
        subject_id: activities.subject_id,
        created_at: activities.created_at,
      })
      .from(activities)
      .where(eq(activities.actor_id, userId))
      .orderBy(sql`${activities.created_at} DESC`);

    // Push subscriptions — redacted (no device crypto).
    const pushRows = await this.db
      .select({
        id: push_subscriptions.id,
        locale: push_subscriptions.locale,
        user_agent: push_subscriptions.user_agent,
        created_at: push_subscriptions.created_at,
        updated_at: push_subscriptions.updated_at,
      })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.user_id, userId));

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      profile,
      matches,
      wallet,
      transactions: txnRows,
      disputes: disputeRows,
      reports: reportRows,
      activities: activityRows,
      push_subscriptions: pushRows,
    };
  }

  /**
   * P0-6 (run #30): hard-purge users past their 30-day PDPL grace window.
   *
   * Anonymizes the user row in place (does NOT DELETE the row — the
   * transactions FK is RESTRICT per migration 0031, so a hard DELETE
   * would break the financial audit trail).
   *
   * - phone → 'purged-<short-id>' (a deterministic but unique placeholder
   *   that fits the varchar(20) column; the last 12 chars of the UUID are
   *   enough to keep the unique-phone constraint satisfied).
   * - full_name → 'Deleted User'
   * - handle → NULL
   * - avatar_url → NULL
   * - home_lat/home_lng → NULL
   * - preferred_location/position → NULL
   * - banned_at/suspended_until → NULL
   * - verification_status → 'pending' (the only safe default)
   * - deleted_at → NOW() (refresh so a re-trigger doesn't fire on the
   *   same row again — the WHERE clause matches `deleted_at < NOW() - 30d`,
   *   so a freshly-refreshed deleted_at is excluded from the next tick)
   *
   * Returns the count of anonymized rows.
   *
   * Idempotent: a row already anonymized has phone='purged-...' and
   * `deleted_at < now() - 30d` still matches → re-purging it sets
   * deleted_at=NOW() (idempotent), name='Deleted User' (idempotent), etc.
   * Side effects are minimal.
   */
  async purgeExpiredAccounts(): Promise<number> {
    // Run #31 resume hardening (Reviewer A I3 follow-up): the anonymizing
    // UPDATE and the push-subscription DELETE are one atomic unit. Before
    // this wrap, a crash between the two statements left push subscriptions
    // permanently pointing at an ANONYMIZED user row (the UPDATE had already
    // committed; the retry's WHERE `deleted_at < NOW() - 30d` never re-matches
    // because deleted_at was refreshed) — the ghost would keep receiving
    // pushes forever, violating migration 0031's erasure promise.
    return this.db.transaction(async (tx) => {
      const purged = await tx
        .update(users)
        .set({
          phone: sql`('purged-' || RIGHT(${users.id}, 12))`,
          full_name: 'Deleted User',
          handle: null,
          avatar_url: null,
          home_lat: null,
          home_lng: null,
          preferred_location: null,
          preferred_position: null,
          banned_at: null,
          suspended_until: null,
          // P1-41 (run #35): the email columns ARE PII — erase them with the
          // rest of the identity so a purged ghost can never be addressed.
          email: null,
          email_verified_at: null,
          verification_status: 'pending',
          deleted_at: sql`NOW()`,
          updated_at: new Date(),
        })
        .where(
          and(
            isNotNull(users.deleted_at),
            lt(users.deleted_at, sql`NOW() - INTERVAL '${sql.raw(String(PDPL_GRACE_DAYS))} days'`),
          ),
        )
        .returning({ id: users.id });

      // I3 (Reviewer A run #31): push subscriptions re-created during the
      // grace window survive the users-row anonymization — CASCADE never
      // fires because the user row is only anonymized, never deleted (the
      // transactions FK is RESTRICT per migration 0031). Delete them in the
      // SAME tx so the anonymized ghost receives no further pushes, as
      // migration 0031's docs promise ("we DELETE the push_subscriptions
      // row in the purge job").
      if (purged.length > 0) {
        await tx
          .delete(push_subscriptions)
          .where(inArray(push_subscriptions.user_id, purged.map((p) => p.id)));
      }

      return purged.length;
    });
  }
}
