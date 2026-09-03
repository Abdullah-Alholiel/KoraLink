import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import { UnifonicService } from './unifonic.service';
import { OtpStoreService } from './otp-store.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { withTimestamp } from '../../common/utils/timestamp';
import { randomInt } from 'node:crypto';

type DB = PostgresJsDatabase<typeof schema>;

/** Roles allowed per calling surface — hard product rule:
 *  the PWA is player-only, the ops console is staff-only. */
const SURFACE_ROLES: Record<'player' | 'ops', string[]> = {
  player: ['Player'],
  ops: ['Admin', 'VenueOwner'],
};

function assertSurfaceRole(surface: 'player' | 'ops' | undefined, role: string): void {
  if (!surface) return; // legacy/internal calls without a surface
  if (!SURFACE_ROLES[surface].includes(role)) {
    throw new ForbiddenException(
      surface === 'player'
        ? 'This account is not a player account. Use the ops console.'
        : 'This console is for admins and venue owners only. Players use the KoraLink app.',
    );
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly unifonic: UnifonicService,
    private readonly otpStore: OtpStoreService,
  ) {
    this.logger.log('OTP store backed by Redis (cache-manager).');
  }

  async sendOtp(phone: string, ip?: string): Promise<void> {
    // ── Abuse protection: resend cooldown + per-phone daily + per-IP daily ──
    if (await this.otpStore.isCooldownActive(phone)) {
      this.logger.warn(`send-otp blocked (cooldown) for ${phone}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Please wait before requesting another code.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const dailyCount = await this.otpStore.getDailyCount(phone);
    if (dailyCount >= OtpStoreService.DAILY_CAP) {
      this.logger.warn(
        `send-otp blocked (daily cap ${dailyCount}/${OtpStoreService.DAILY_CAP}) for ${phone}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily SMS limit reached. Try again tomorrow.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // P2-19 (run #27): per-IP daily cap. A bot net rotating phones against
    // one source IP still drains the Unifonic budget without this gate.
    // The per-IP counter is independent of the per-phone counter — hitting
    // the per-IP cap blocks ALL phones from that IP, not just one.
    if (ip) {
      const ipDailyCount = await this.otpStore.getIpDailyCount(ip);
      if (ipDailyCount >= OtpStoreService.DAILY_IP_CAP) {
        this.logger.warn(
          `send-otp blocked (IP daily cap ${ipDailyCount}/${OtpStoreService.DAILY_IP_CAP}) from ${ip}`,
        );
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

    const code = this.generateOtp();

    // Upsert user record so the phone always exists before OTP is saved.
    await this.db
      .insert(users)
      .values(withTimestamp({ phone }))
      .onConflictDoNothing({ target: users.phone });

    // P0-6 (run #29): PDPL soft-delete. If the phone belongs to a deleted
    // account, BLOCK OTP dispatch. The user must restore first (the only
    // surface for that is the in-app banner on a still-valid session, or
    // a support-assisted restore if their JWT expired during the grace
    // window). Without this guard, an attacker who knows a deleted user's
    // phone could re-create them with the same phone (unique constraint
    // would block the upsert, but they'd be able to mint an OTP for the
    // row that exists). Also blocks a deactivated user from accidentally
    // resetting via re-login flow.
    const [existingUser] = await this.db
      .select({ id: users.id, deleted_at: users.deleted_at })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (existingUser?.deleted_at) {
      this.logger.warn(
        `send-otp blocked (deleted_at IS NOT NULL) for phone ${phone}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Account scheduled for deletion.',
          error: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Store OTP in Redis via cache-manager (5-minute TTL handled by store).
    await this.otpStore.setOtp(phone, code);
    await this.otpStore.setCooldown(phone);
    await this.otpStore.incrementDaily(phone);
    if (ip) {
      await this.otpStore.incrementIpDaily(ip);
    }

    await this.unifonic.sendSms(phone, `Your KoraLink code: ${code}`);
  }

  async verifyOtp(
    phone: string,
    code: string,
    surface?: 'player' | 'ops',
  ): Promise<{ token: string; isNewUser: boolean }> {
    // ── Abuse protection: attempt lockout ──
    const failCount = await this.otpStore.getFailCount(phone);
    if (failCount >= OtpStoreService.FAIL_LIMIT) {
      this.logger.warn(`verify-otp blocked (lockout after ${failCount} fails) for ${phone}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedCode = await this.otpStore.getOtp(phone);

    if (!storedCode || storedCode !== code) {
      await this.otpStore.incrementFail(phone);
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    await this.otpStore.deleteOtp(phone);
    await this.otpStore.resetFails(phone);

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Moderation enforcement at login: a banned/suspended account must not be
    // able to mint a fresh 7-day JWT (the guard alone would just log them out,
    // which they could defeat by re-authenticating).
    if (user.banned_at) {
      throw new ForbiddenException('Account banned.');
    }
    if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
      throw new ForbiddenException('Account suspended.');
    }
    // P0-6 (run #29): PDPL soft-delete. A deleted account must not be
    // able to mint a fresh 7-day JWT by re-authenticating — the only
    // escape is POST /users/me/restore. Throwing here blocks the token
    // mint at the source. (If the user has a still-valid JWT, the
    // jwt-cookie strategy already 401s on every guarded call.)
    if (user.deleted_at) {
      throw new ForbiddenException('Account scheduled for deletion.');
    }

    // Surface separation — the PWA never issues sessions for staff roles and
    // vice versa (hard product rule).
    assertSurfaceRole(surface, user.role);

    const isNewUser = !user.full_name;

    const token = this.jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role },
      { expiresIn: this.config.get('JWT_EXPIRY', '7d') },
    );

    return { token, isNewUser };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, dto.handle))
      .limit(1);

    if (existing && existing.id !== userId) {
      throw new BadRequestException('Handle already taken.');
    }

    const [updated] = await this.db
      .update(users)
      .set(withTimestamp(dto))
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        phone: users.phone,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        skill_level: users.skill_level,
        preferred_location: users.preferred_location,
        preferred_position: users.preferred_position,
        role: users.role,
      });

    return updated;
  }

  private generateOtp(): string {
   // crypto.randomInt uses the OS CSPRNG — unlike Math.random() it is
   // cryptographically secure and suitable for OTP generation.
   return randomInt(100_000, 1_000_000).toString();
 }

 /**
  * DEV ONLY — Returns a JWT for a seeded user by phone number.
  * Skips OTP entirely. Feature-gated by `DEV_LOGIN_ENABLED` in the controller
  * (P0-7, run #26: explicit opt-in replaces the old NODE_ENV string gate).
  *
  * Always signs with `expiresIn: JWT_EXPIRY || '7d'` — defense in depth so
  * the issued JWT is never non-expiring even if the controller gate is later
  * bypassed by a misconfigured deployment.
  */
 async devLogin(phone: string, surface?: 'player' | 'ops'): Promise<string> {
   const [user] = await this.db
     .select({
       id: users.id,
       phone: users.phone,
       role: users.role,
       banned_at: users.banned_at,
       suspended_until: users.suspended_until,
     })
     .from(users)
     .where(eq(users.phone, phone))
     .limit(1);

   if (!user) {
     throw new NotFoundException(
       `No user found with phone ${phone}. Seed the database first.`,
     );
   }

   if (user.banned_at) {
     throw new ForbiddenException('Account banned.');
   }
   if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
     throw new ForbiddenException('Account suspended.');
   }

   assertSurfaceRole(surface, user.role);

   return this.jwt.signAsync(
     {
       sub: user.id,
       phone: user.phone,
       role: user.role,
     },
     {
       expiresIn: this.config.get<string>('JWT_EXPIRY', '7d'),
     },
   );
}
}
