import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomInt } from 'node:crypto';

import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import { OtpStoreService } from './otp-store.service';
import { otpMatches } from '../../common/security/otp-compare';
import { EMAIL_SENDER, EmailSender } from './email-sender.port';
import { withTimestamp } from '../../common/utils/timestamp';
import { assertSurfaceRole } from './auth.service';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Email + OTP login (P0-9 / email-otp-login cycle, run #46).
 *
 * Mirrors AuthService's phone flow with ONE key difference: Redis counters
 * are keyed `email:<addr>` so email and phone share the SAME abuse-cap
 * machinery (cooldown / daily / per-IP / fail-lockout) in disjoint keyspaces.
 *
 * Contract (docs/plans/email-otp-login/03-program-design.md):
 *  - send is ALWAYS non-committal (no user upsert on send — anti-enumeration;
 *    unlike the phone flow, which must upsert to key the OTP).
 *  - user creation happens on FIRST SUCCESSFUL verify (email-only row,
 *    phone NULL — allowed since migration 0038).
 *  - First successful verify stamps users.email_verified_at.
 *  - JWT: { sub, email, role } (+ phone when the user has one).
 */
const OTP_KEY = (email: string) => `email:${email}`;

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otpStore: OtpStoreService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async requestEmailOtp(email: string, ip?: string): Promise<void> {
    const key = OTP_KEY(email);

    // ── Abuse protection — identical thresholds to the phone flow ──
    if (await this.otpStore.isCooldownActive(key)) {
      this.logger.warn(`email send-otp blocked (cooldown) for ${email}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Please wait before requesting another code.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const dailyCount = await this.otpStore.getDailyCount(key);
    if (dailyCount >= OtpStoreService.DAILY_CAP) {
      this.logger.warn(
        `email send-otp blocked (daily cap ${dailyCount}/${OtpStoreService.DAILY_CAP}) for ${email}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily email limit reached. Try again tomorrow.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ip) {
      const ipDailyCount = await this.otpStore.getIpDailyCount(ip);
      if (ipDailyCount >= OtpStoreService.DAILY_IP_CAP) {
        this.logger.warn(
          `email send-otp blocked (IP daily cap ${ipDailyCount}/${OtpStoreService.DAILY_IP_CAP}) from ${ip}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Daily email limit reached for this IP. Try again tomorrow.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // PDPL soft-delete guard: a deleted account's address must not receive
    // login codes (re-creation happens ONLY through support/restore flows).
    const [existing] = await this.db
      .select({ id: users.id, deleted_at: users.deleted_at })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existing?.deleted_at) {
      // PDPL soft-delete guard: a deleted account's address must not receive
      // login codes (re-creation happens ONLY through support/restore flows).
      // The endpoint's contract is ALWAYS-202 non-committal (anti-enumeration),
      // so the drop is SILENT — externally identical to a send to an unknown
      // address (a 403 here would confirm the address exists).
      this.logger.warn(
        `email send-otp silently dropped (deleted_at IS NOT NULL) for ${email}`,
      );
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.otpStore.setOtp(key, code);
    await this.otpStore.setCooldown(key);
    await this.otpStore.incrementDaily(key);
    if (ip) {
      await this.otpStore.incrementIpDaily(ip);
    }

    // NOTE: no user upsert here — creation is deferred to a successful
    // verify so a send never leaves a half-identity row behind, and the
    // endpoint cannot be probed to discover which addresses exist.
    await this.emailSender.send(
      email,
      'Your KoraLink login code',
      renderOtpEmail(code),
      code,
    );
    this.logger.log(`email OTP dispatched to ${email}`);
  }

  async verifyEmailOtp(
    email: string,
    code: string,
    surface?: 'player' | 'ops',
  ): Promise<{ token: string; isNewUser: boolean }> {
    const key = OTP_KEY(email);

    const failCount = await this.otpStore.getFailCount(key);
    if (failCount >= OtpStoreService.FAIL_LIMIT) {
      this.logger.warn(`email verify-otp blocked (lockout after ${failCount} fails) for ${email}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedCode = await this.otpStore.getOtp(key);
    if (!storedCode || !otpMatches(storedCode, code)) {
      await this.otpStore.incrementFail(key);
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    await this.otpStore.deleteOtp(key);
    await this.otpStore.resetFails(key);

    // lower() matches the partial unique index from migration 0033.
    let [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    // First successful verify for an unknown address → create the account
    // (email-only: phone stays NULL per migration 0038).
    if (!user) {
      try {
        [user] = await this.db
          .insert(users)
          .values(withTimestamp({ email }))
          .returning();
        this.logger.log(`email signup: created user ${user.id} for ${email}`);
      } catch (err) {
        // 23505 unique_violation: a concurrent verify holding the SAME fresh
        // code created the account first (check-then-act between getOtp and
        // the insert — both pass the gate before either deleteOtp lands).
        // Re-select the winner and continue; the login still completes.
        if (
          typeof err === 'object' &&
          err !== null &&
          (err as { code?: string }).code === '23505'
        ) {
          [user] = await this.db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${email}`)
            .limit(1);
          this.logger.log(
            `email signup: lost create race, joined existing user ${user?.id ?? '?'}`,
          );
        } else {
          throw err;
        }
      }
    }

    if (!user) {
      // Unreachable in practice (the 23505 winner row must exist); guards
      // the moderation gates below from a missing row.
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    // Moderation gates — identical to the phone flow.
    if (user.banned_at) {
      throw new ForbiddenException('Account banned.');
    }
    if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
      throw new ForbiddenException('Account suspended.');
    }
    if (user.deleted_at) {
      throw new ForbiddenException('Account scheduled for deletion.');
    }

    assertSurfaceRole(surface, user.role);

    if (!user.email_verified_at) {
      await this.db
        .update(users)
        .set(withTimestamp({ email_verified_at: new Date() }))
        .where(eq(users.id, user.id));
    }

    const isNewUser = !user.full_name;

    const payload: Record<string, string | null> = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    if (user.phone) {
      payload.phone = user.phone;
    }

    const token = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_EXPIRY', '7d'),
    });

    return { token, isNewUser };
  }
}

/** Bilingual (EN+AR) OTP email — brand rule: every user-facing surface ships both. */
function renderOtpEmail(code: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b1210;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#122019;border-radius:12px;padding:32px;text-align:center;">
    <p style="color:#9fb3a8;font-size:14px;margin:0 0 8px;">KoraLink</p>
    <h1 style="color:#e8f2ec;font-size:20px;margin:0 0 16px;">Your KoraLink login code</h1>
    <div style="font-size:36px;letter-spacing:8px;color:#4ade80;font-weight:bold;">${code}</div>
    <p style="color:#9fb3a8;font-size:13px;margin:16px 0 4px;" dir="rtl">رمز الدخول الخاص بك في KoraLink</p>
    <p style="color:#5f7268;font-size:12px;margin:24px 0 0;">This code expires in 5 minutes. If you didn't request it, ignore this email.</p>
  </div>
</body></html>`;
}
