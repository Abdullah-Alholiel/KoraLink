import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq, and, ne, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Sentry from '@sentry/node';
import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import { MailerService } from './mailer.service';

type DB = PostgresJsDatabase<typeof schema>;

/** Lightweight shape check; the transport + provider deliverability do the rest. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const VERIFY_PURPOSE = 'email-verify';

interface VerifyPayload {
  sub: string;
  email: string;
  purpose: string;
}

/**
 * P1-41 (run #35) — user email collection + verification state machine.
 *
 * Lives in the mailer module (not UsersService) so the feature is one
 * importable unit. Uses JwtService from @nestjs/jwt — MailerModule
 * registers its OWN JwtModule instance with the same JWT_SECRET (no
 * AuthModule import → no module cycles; mirrors the auth.module factory).
 */
@Injectable()
export class MailerUsersService {
  private readonly logger = new Logger(MailerUsersService.name);
  private readonly apiPublicUrl: string;

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly mailer: MailerService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    // The verification LINK must open the API-served HTML page, so it points
    // at the API's publicly reachable origin (Tailscale HTTPS proxy in this
    // deployment). Falls back to PLAYER_URL when unset (dev).
    this.apiPublicUrl = (
      config.get<string>('API_PUBLIC_URL', '') ||
      config.get<string>('PLAYER_URL', 'http://localhost:3000')
    ).replace(/\/+$/, '');
  }

  /**
   * Set/replace the account email. Clears verification on change (an
   * unverified address gates ALL transactional mail). Domain errors are
   * plain Errors mapped by the controller: INVALID_EMAIL → 400,
   * EMAIL_TAKEN → 409.
   */
  async setEmail(
    userId: string,
    rawEmail: string,
  ): Promise<{
    email: string;
    emailVerified: boolean;
    verificationSent: boolean;
  }> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) {
      throw new Error('INVALID_EMAIL');
    }

    // Case-insensitive conflict check (matches migration 0033's lower(email) uidx).
    const [conflict] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(sql`LOWER(${users.email})`, email), ne(users.id, userId)))
      .limit(1);
    if (conflict) {
      throw new Error('EMAIL_TAKEN');
    }

    await this.db
      .update(users)
      .set({
        email,
        email_verified_at: null,
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));

    const sent = await this.sendVerification(userId, email, 'welcome_verify');
    return {
      email,
      emailVerified: false,
      verificationSent: sent,
    };
  }

  /** Re-send the verification email for the CURRENT stored address. */
  async resendVerification(userId: string): Promise<{ verificationSent: boolean }> {
    const [user] = await this.db
      .select({ email: users.email, verified: users.email_verified_at })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.email) throw new Error('NO_EMAIL');
    if (user.verified) return { verificationSent: false }; // already verified — nothing to do

    const sent = await this.sendVerification(userId, user.email, 'email_verify');
    return { verificationSent: sent };
  }

  /** Mint the 48h purpose-scoped verify token + send it. True when a send happened. */
  private async sendVerification(
    userId: string,
    email: string,
    template: 'welcome_verify' | 'email_verify',
  ): Promise<boolean> {
    try {
      const token = await this.jwt.signAsync(
        { sub: userId, email, purpose: VERIFY_PURPOSE },
        { expiresIn: '48h' }, // ALWAYS expiring (P0-7 rule: no non-expiring JWTs)
      );
      const verifyUrl = `${this.apiPublicUrl}/api/v1/email/verify?token=${encodeURIComponent(token)}`;
      const outcome = await this.mailer.sendVerificationEmail(
        email,
        userId,
        verifyUrl,
        template,
      );
      return outcome.status === 'sent';
    } catch (err) {
      this.logger.warn(
        `sendVerification failed for user ${userId}: ${(err as Error).message}`,
      );
      Sentry.captureException(err, { tags: { component: 'mailer-users' } });
      return false;
    }
  }

  /** Consume a purpose:'email-verify' token → stamp email_verified_at. */
  async verifyEmail(token: string): Promise<{ userId: string; email: string }> {
    let payload: VerifyPayload;
    try {
      payload = await this.jwt.verifyAsync<VerifyPayload>(token);
    } catch {
      throw new Error('TOKEN_INVALID');
    }
    if (payload.purpose !== VERIFY_PURPOSE || !payload.sub || !payload.email) {
      throw new Error('TOKEN_INVALID');
    }

    const [user] = await this.db
      .select({ id: users.id, email: users.email, deleted_at: users.deleted_at })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!user || user.deleted_at) throw new Error('USER_NOT_FOUND');
    // The token binds the address; if the user changed email after minting,
    // this token is stale by design (a newer one was sent).
    if ((user.email ?? '').toLowerCase() !== payload.email.toLowerCase()) {
      throw new Error('TOKEN_STALE');
    }

    await this.db
      .update(users)
      .set({ email_verified_at: new Date(), updated_at: new Date() })
      .where(eq(users.id, user.id));

    return { userId: user.id, email: user.email! };
  }

  /** Bilingual (ar-first) success page for the verification link. */
  verifySuccessPage(email: string): string {
    return verifyPageShell(
      'تم تفعيل بريدك الإلكتروني',
      'Email verified',
      `أصبح بريدك <b dir="ltr">${escapeHtml(email)}</b> مفعلولاً — ستصلك تفعيلات المباريات والتحديثات عبر البريد.`,
      'You will now receive match reminders and account updates by email.',
      '#16a34a',
    );
  }

  /** Bilingual (ar-first) error page. reason: invalid | stale | deleted */
  verifyErrorPage(reason: 'invalid' | 'stale' | 'deleted'): string {
    const ar =
      reason === 'stale'
        ? 'هذا الرابط لم يعد صالحاً — غالباً لأنك غيّرت البريد أو أُرسل رابط أحدث. اطلب رسالة تفعيل جديدة من التطبيق.'
        : reason === 'deleted'
          ? 'هذا الحساب لم يعد موجوداً.'
          : 'الرابط غير صالح أو منتهي. اطلب رسالة تفعيل جديدة من التطبيق.';
    const en =
      reason === 'stale'
        ? 'This link is no longer valid — you likely changed your email or a newer link was sent. Request a new verification email in the app.'
        : reason === 'deleted'
          ? 'This account no longer exists.'
          : 'The link is invalid or expired. Request a new verification email in the app.';
    return verifyPageShell('تعذّر تفعيل البريد', 'Verification failed', ar, en, '#dc2626');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Self-contained RTL-first bilingual page (inline styles, no assets). */
function verifyPageShell(
  arTitle: string,
  enTitle: string,
  arBody: string,
  enBody: string,
  accent: string,
): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(arTitle)}</title></head>
<body style="margin:0;padding:0;background:#f5f6f7;font-family:Tajawal,'Segoe UI',Tahoma,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;background:#ffffff;border-radius:16px;padding:36px 30px;text-align:center;">
<tr><td style="font-size:20px;font-weight:800;color:#111827;padding-bottom:14px;">كورا لينك · KoraLink</td></tr>
<tr><td style="font-size:19px;font-weight:700;color:${accent};padding-bottom:10px;">${arTitle}</td></tr>
<tr><td style="font-size:15px;line-height:1.8;color:#374151;padding-bottom:8px;">${arBody}</td></tr>
<tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
<tr><td dir="ltr" style="font-size:15px;font-weight:600;color:${accent};padding-bottom:10px;">${enTitle}</td></tr>
<tr><td dir="ltr" style="font-size:14px;line-height:1.7;color:#6b7280;">${enBody}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
