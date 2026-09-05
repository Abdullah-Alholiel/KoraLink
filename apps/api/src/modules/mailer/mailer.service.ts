import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inArray, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Sentry from '@sentry/node';
import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import {
  MAIL_TEMPLATES,
  MAIL_DETAIL_LABELS,
  MailTemplateKey,
  MailLocale,
  mailFooter,
  mailBrand,
} from './mailer.copy';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Extra rows rendered in the email's details box (all optional).
 * `when`/`where`/`amount` are PRE-FORMATTED by the caller (mail has no
 * client-side Intl; server renders Riyadh-local strings).
 */
export interface EmailDetails {
  matchId?: string;
  matchTitle?: string;
  when?: string;
  where?: string;
  amount?: string;
}

export interface MailRecipient {
  userId: string;
  email: string;
  locale: MailLocale;
}

/** Result of a suppression-checked send attempt (per user). */
export type SendOutcome =
  | { userId: string; status: 'sent' }
  | { userId: string; status: 'skipped'; reason: string }
  | { userId: string; status: 'failed'; reason: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly playerUrl: string;

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('RESEND_API_KEY', '') ?? '';
    this.from = config.get<string>('MAIL_FROM', '') ?? '';
    this.playerUrl = (
      config.get<string>('PLAYER_URL', 'https://koralink.app') ?? ''
    ).replace(/\/+$/, '');
    if (!this.apiKey || !this.from) {
      // Deliberate: email self-disables without configuration (plan §Gate 2).
      this.logger.warn(
        'mailer: RESEND_API_KEY/MAIL_FROM not set — transactional email DISABLED (log-only mode)',
      );
    }
  }

  /** Feature flag: true when a transport is actually configured. */
  get isConfigured(): boolean {
    return this.apiKey.length > 0 && this.from.length > 0;
  }

  /**
   * Resolve the suppression-checked recipient list for a set of user IDs.
   * Suppression contract (Gate 3, amendment 5): email IS NOT NULL AND
   * email_verified_at IS NOT NULL AND email_muted = false AND deleted_at IS NULL.
   * Per-category mutes do NOT gate email v1 (global kill-switch only).
   */
  async recipientsFor(userIds: string[]): Promise<MailRecipient[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        deleted_at: users.deleted_at,
        email_verified_at: users.email_verified_at,
        email_muted: users.email_muted,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    const out: MailRecipient[] = [];
    for (const r of rows) {
      if (!r.email || !EMAIL_PATTERN.test(r.email)) continue;
      if (!r.email_verified_at) continue;
      if (r.email_muted) continue;
      if (r.deleted_at) continue; // PDPL ghosts are never addressed
      out.push({ userId: r.id, email: r.email, locale: 'ar' }); // Saudi market default (plan §Gate 2)
    }
    return out;
  }

  /**
   * Best-effort transactional send to a set of users. NEVER throws —
   * email is a side-effect of a state change, identical to push semantics.
   */
  async sendToUsers(
    userIds: string[],
    template: MailTemplateKey,
    vars: Record<string, string> = {},
    details: EmailDetails = {},
  ): Promise<SendOutcome[]> {
    if (userIds.length === 0) return [];
    try {
      const recipients = await this.recipientsFor(userIds);
      const skipped = userIds.filter(
        (id) => !recipients.some((r) => r.userId === id),
      );
      const outcomes: SendOutcome[] = skipped.map((userId) => ({
        userId,
        status: 'skipped' as const,
        reason: 'no-verified-email-or-muted-or-ghost',
      }));
      for (const r of recipients) {
        outcomes.push(await this.deliver(r, template, vars, details));
      }
      return outcomes;
    } catch (err) {
      this.logger.warn(
        `mailer.sendToUsers(${template}) failed: ${(err as Error).message}`,
      );
      Sentry.captureException(err, {
        tags: { component: 'mailer', template },
      });
      return [];
    }
  }

  /**
   * Direct-address send (verification emails to a NOT-yet-verified address).
   * Bypasses the verified-gate by definition but STILL respects email_muted
   * + soft-delete (a ghost or muted user gets nothing, even verifications).
   */
  async sendVerificationEmail(
    to: string,
    userId: string,
    verifyUrl: string,
    template: Extract<MailTemplateKey, 'welcome_verify' | 'email_verify'>,
  ): Promise<SendOutcome> {
    const [row] = await this.db
      .select({ deleted_at: users.deleted_at, email_muted: users.email_muted })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row || row.deleted_at) {
      return { userId, status: 'skipped', reason: 'deleted' };
    }
    if (row.email_muted) {
      return { userId, status: 'skipped', reason: 'muted' };
    }
    return this.deliver(
      { userId, email: to, locale: 'ar' },
      template,
      { verifyUrl },
      {},
    );
  }

  /** Render + deliver one email. One transport call, log-not-throw. */
  private async deliver(
    recipient: MailRecipient,
    template: MailTemplateKey,
    vars: Record<string, string>,
    details: EmailDetails,
  ): Promise<SendOutcome> {
    if (!this.isConfigured) {
      this.logger.log(
        `mailer(noop): ${template} → user ${recipient.userId} <${recipient.email}>`,
      );
      return { userId: recipient.userId, status: 'skipped', reason: 'transport-unconfigured' };
    }
    const { subject, html, text } = renderEmail(
      template,
      recipient.locale,
      vars,
      details,
      this.playerUrl,
    );
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [recipient.email],
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        this.logger.warn(
          `mailer: transport ${res.status} for ${template} → ${recipient.userId}: ${body}`,
        );
        Sentry.captureException(new Error(`mail transport ${res.status}`), {
          tags: { component: 'mailer', template },
          extra: { status: res.status, userId: recipient.userId },
        });
        return { userId: recipient.userId, status: 'failed', reason: `transport-${res.status}` };
      }
      return { userId: recipient.userId, status: 'sent' };
    } catch (err) {
      this.logger.warn(
        `mailer: transport error for ${template} → ${recipient.userId}: ${(err as Error).message}`,
      );
      Sentry.captureException(err, { tags: { component: 'mailer', template } });
      return { userId: recipient.userId, status: 'failed', reason: 'transport-error' };
    }
  }
}

/**
 * Render a template to {subject, html, text} — inline styles (mail clients
 * strip <style>), dir switches on locale, details box, CTA button.
 * Plain-text alternative built from the same copy (no HTML stripping).
 * (Mail locale: v1 pins Arabic — the Saudi-market default; the recipient
 * locale column arrives with the PWA profile screen slice.)
 */
function fillVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    escapeHtml(vars[key] ?? ''),
  );
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a template to {subject, html, text} — inline styles (mail clients
 * strip <style>), dir switches on locale, details box, CTA button.
 * Plain-text alternative built from the same copy (no HTML stripping).
 */
export function renderEmail(
  template: MailTemplateKey,
  locale: MailLocale,
  vars: Record<string, string>,
  details: EmailDetails,
  playerUrl: string,
): RenderedEmail {
  const copy = MAIL_TEMPLATES[template][locale];
  const labels = MAIL_DETAIL_LABELS[locale];
  const brand = mailBrand(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const subject = fillVars(copy.subject, vars);
  // fillVars already HTML-escapes interpolated {{vars}}; the dictionary copy
  // is trusted (repo-owned), so NO second escape pass here (double-escape bug).
  const heading = fillVars(copy.heading, vars);
  const body = fillVars(copy.body, vars);

  const ctaUrl = details.matchId ? `${playerUrl}/ar/match/${details.matchId}` : playerUrl;

  const rows: [string, string][] = [];
  if (details.matchTitle) rows.push([labels.match, details.matchTitle]);
  if (details.when) rows.push([labels.when, details.when]);
  if (details.where) rows.push([labels.where, details.where]);
  if (details.amount) rows.push([labels.amount, details.amount]);
  const detailsHtml = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f6f7;border-radius:12px;margin:16px 0;padding:2px 14px;">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:9px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(
              k,
            )}</td><td style="padding:9px 0;font-size:14px;font-weight:600;color:#111827;text-align:${dir === 'rtl' ? 'left' : 'right'};">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f6f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px 28px;font-family:Tajawal,'Segoe UI',Tahoma,Arial,sans-serif;direction:${dir};">
  <tr><td style="font-size:20px;font-weight:800;color:#111827;padding-bottom:4px;">${escapeHtml(brand)}</td></tr>
  <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="font-size:22px;font-weight:700;color:#111827;">${heading}</td></tr>
  <tr><td style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="font-size:15px;line-height:1.7;color:#374151;">${body}</td></tr>
  ${detailsHtml}
  <tr><td style="height:18px;line-height:18px;font-size:0;">&nbsp;</td></tr>
  <tr><td align="${dir === 'rtl' ? 'right' : 'left'}">
    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 26px;border-radius:999px;">${escapeHtml(copy.cta)}</a>
  </td></tr>
  <tr><td style="height:22px;line-height:22px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px;">${escapeHtml(mailFooter(locale))}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const detailLines = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const text = `${heading}\n\n${body}${detailLines ? `\n\n${detailLines}` : ''}\n\n${copy.cta}: ${ctaUrl}\n\n${mailFooter(locale)}`;

  return { subject, html, text };
}
