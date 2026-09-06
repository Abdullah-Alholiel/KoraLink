import { MailerService, renderEmail } from './mailer.service';
import {
  MAIL_TEMPLATES,
  MAIL_DETAIL_LABELS,
  EMAIL_ACTIVITY_VERBS,
  MailTemplateKey,
} from './mailer.copy';

/**
 * P1-41 (run #35) — transactional email specs.
 *
 * Gate 3 contract, enforced here:
 *  - every template renders in BOTH locales (subject/heading/body/cta non-empty);
 *  - ar renders dir="rtl" + lang="ar" (RTL-first Saudi market), en dir="ltr";
 *  - {{vars}} substitute AND HTML-escape (match titles are user content);
 *  - suppression: unverified / muted / soft-deleted (ghost) users are NEVER
 *    recipients; per-category mutes do NOT gate email (v1 contract);
 *  - unconfigured transport → status 'skipped' + reason 'transport-unconfigured'
 *    and NO network call (feature self-disables);
 *  - social verbs (messaged/created_match/joined_match/followed) are excluded
 *    from the email choke point (chat DMs stay out of scope).
 */

/** Stub DB for the mailer's single select — returns canned user rows. */
function makeDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  };
}

function makeConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, def?: string) => values[key] ?? def,
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`missing ${key}`);
      return values[key];
    },
  };
}

function makeMailer(
  rows: unknown[] = [],
  config: Record<string, string> = {},
): MailerService {
  return new MailerService(
    makeDb(rows) as never,
    makeConfig(config) as never,
  );
}

describe('P1-41 mail templates (run #35)', () => {
  const ALL_KEYS = Object.keys(MAIL_TEMPLATES) as MailTemplateKey[];

  it('every template has complete en + ar copy (subject/heading/body/cta)', () => {
    for (const key of ALL_KEYS) {
      for (const locale of ['en', 'ar'] as const) {
        const copy = MAIL_TEMPLATES[key][locale];
        expect(copy.subject.trim()).toBeTruthy();
        expect(copy.heading.trim()).toBeTruthy();
        expect(copy.body.trim()).toBeTruthy();
        expect(copy.cta.trim()).toBeTruthy();
      }
    }
  });

  it('detail labels exist in both locales', () => {
    for (const locale of ['en', 'ar'] as const) {
      const l = MAIL_DETAIL_LABELS[locale];
      expect(l.match).toBeTruthy();
      expect(l.when).toBeTruthy();
      expect(l.where).toBeTruthy();
      expect(l.amount).toBeTruthy();
    }
  });

  it('ar render is RTL (dir="rtl", lang="ar"); en is LTR', () => {
    const ar = renderEmail('match_rescheduled', 'ar', { title: 'مباراة' }, { matchId: 'm1' }, 'https://x');
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain('lang="ar"');
    const en = renderEmail('match_rescheduled', 'en', { title: 'Match' }, { matchId: 'm1' }, 'https://x');
    expect(en.html).toContain('dir="ltr"');
    expect(en.html).toContain('lang="en"');
  });

  it('substitutes {{title}} into the subject and escapes HTML in user content', () => {
    const evil = 'Match <script>alert(1)</script>';
    const out = renderEmail('match_reminder', 'en', { title: evil }, {}, 'https://x');
    expect(out.subject).toContain('Match');
    expect(out.subject).not.toContain('<script>');
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('renders the details box with match/when/where/amount rows', () => {
    const out = renderEmail(
      'wallet_refunded',
      'en',
      {},
      { matchId: 'm1', matchTitle: 'Final', when: '1 Jan 2026, 18:00', where: 'Riyadh', amount: 'SAR 35.00' },
      'https://x',
    );
    expect(out.html).toContain('Final');
    expect(out.html).toContain('1 Jan 2026, 18:00');
    expect(out.html).toContain('Riyadh');
    expect(out.html).toContain('SAR 35.00');
    // CTA deep-links to the match, locale-aware (run #36: was hardcoded /ar/).
    expect(out.html).toContain('https://x/en/match/m1');
  });

  it('produces a plain-text alternative with no HTML tags', () => {
    const out = renderEmail('pom_decided', 'ar', {}, { matchId: 'm1', matchTitle: 'نصف النهائي' }, 'https://x');
    expect(out.text).not.toContain('<');
    expect(out.text).toContain('https://x/ar/match/m1');
    // Run #36: en locale now deep-links to /en/, not a hardcoded /ar/.
    const outEn = renderEmail('wallet_refunded', 'en', {}, { matchId: 'm1' }, 'https://x');
    expect(outEn.html).toContain('https://x/en/match/m1');
  });
});

describe('P1-41 suppression (run #35)', () => {
  const VERIFIED = {
    id: 'u1',
    email: 'p1@test.sa',
    deleted_at: null,
    email_verified_at: new Date(),
    email_muted: false,
  };

  it('verifies + unmuted + alive → recipient', async () => {
    const mailer = makeMailer([VERIFIED]);
    const out = await mailer.recipientsFor(['u1']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: 'u1', email: 'p1@test.sa' });
  });

  it('unverified email → skipped', async () => {
    const mailer = makeMailer([{ ...VERIFIED, email_verified_at: null }]);
    const out = await mailer.recipientsFor(['u1']);
    expect(out).toHaveLength(0);
  });

  it('email_muted → skipped (global kill-switch)', async () => {
    const mailer = makeMailer([{ ...VERIFIED, email_muted: true }]);
    const out = await mailer.recipientsFor(['u1']);
    expect(out).toHaveLength(0);
  });

  it('PDPL ghost (deleted_at set) → skipped', async () => {
    const mailer = makeMailer([{ ...VERIFIED, deleted_at: new Date() }]);
    const out = await mailer.recipientsFor(['u1']);
    expect(out).toHaveLength(0);
  });

  it('malformed email → skipped', async () => {
    const mailer = makeMailer([{ ...VERIFIED, email: 'not-an-email' }]);
    const out = await mailer.recipientsFor(['u1']);
    expect(out).toHaveLength(0);
  });
});

describe('P1-41 transport gating (run #35)', () => {
  it('unconfigured transport → skipped + no crash (feature self-disables)', async () => {
    const mailer = makeMailer(
      [
        {
          id: 'u1',
          email: 'p1@test.sa',
          deleted_at: null,
          email_verified_at: new Date(),
          email_muted: false,
        },
      ],
      {}, // no RESEND_API_KEY / MAIL_FROM
    );
    const outcomes = await mailer.sendToUsers(['u1'], 'wallet_refunded');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual({
      userId: 'u1',
      status: 'skipped',
      reason: 'transport-unconfigured',
    });
    expect(mailer.isConfigured).toBe(false);
  });

  it('configured transport reports isConfigured (no network in unit scope)', () => {
    const mailer = makeMailer([], { RESEND_API_KEY: 're_test_key', MAIL_FROM: 'KoraLink <no-reply@test.sa>' });
    expect(mailer.isConfigured).toBe(true);
  });
});

describe('P1-41 email verb filter (run #35)', () => {
  it('social/chat verbs are NOT transactional email triggers', () => {
    for (const social of ['messaged', 'created_match', 'joined_match', 'followed']) {
      expect(EMAIL_ACTIVITY_VERBS.has(social)).toBe(false);
    }
  });

  it('transactional verbs (money, moderation, lifecycle) ARE triggers', () => {
    for (const tx of [
      'wallet_refunded',
      'match_auto_cancelled',
      'match_cancelled_admin',
      'account_banned',
      'no_show_marked',
      'player_removed',
      'match_rescheduled',
      'pom_decided',
    ] as const) {
      expect(EMAIL_ACTIVITY_VERBS.has(tx)).toBe(true);
    }
  });
});

describe('P1-41 deliver() render hardening (run #36, Reviewer A)', () => {
  /** details object whose `matchTitle` read THROWS — drives a deterministic render failure. */
  function bombDetails(): Record<string, string> {
    const bomb: Record<string, string> = {};
    Object.defineProperty(bomb, 'matchTitle', {
      get() {
        throw new Error('render boom');
      },
    });
    return bomb;
  }

  it('a render throw degrades to ONE render-error outcome (deliver never throws render errors upward)', async () => {
    // Configured transport so deliver() reaches renderEmail; fetch stubbed to
    // success — the ONLY failure source is the poisoned details object.
    const svc = makeMailer([], { RESEND_API_KEY: 'k', MAIL_FROM: 'KoraLink <no-reply@koralink.app>' });
    const deliver = (svc as unknown as { deliver: Function }).deliver.bind(svc);
    const realFetch = global.fetch;
    global.fetch = (async () =>
      new Response(JSON.stringify({ id: 'x' }), { status: 200 })) as unknown as typeof fetch;
    try {
      const ok = await deliver({ userId: 'u1', email: 'a@x.com', locale: 'ar' }, 'wallet_refunded', {}, {});
      const bad = await deliver({ userId: 'u2', email: 'b@x.com', locale: 'ar' }, 'wallet_refunded', {}, bombDetails());
      expect(ok).toMatchObject({ userId: 'u1', status: 'sent' });
      expect(bad).toMatchObject({ userId: 'u2', status: 'failed', reason: 'render-error' });
    } finally {
      global.fetch = realFetch;
    }
  });

  it('sendToUsers keeps collecting outcomes when renders throw mid-batch (old code returned [])', async () => {
    const svc = makeMailer(
      [
        { id: 'u1', email: 'a@x.com', email_verified_at: new Date(), email_muted: false, deleted_at: null },
        { id: 'u2', email: 'b@x.com', email_verified_at: new Date(), email_muted: false, deleted_at: null },
      ],
      { RESEND_API_KEY: 'k', MAIL_FROM: 'KoraLink <no-reply@koralink.app>' },
    );
    const realFetch = global.fetch;
    global.fetch = (async () =>
      new Response(JSON.stringify({ id: 'x' }), { status: 200 })) as unknown as typeof fetch;
    try {
      // Both recipients get the poisoned details → render throws for BOTH.
      // Old behavior: sendToUsers' catch returned [] and discarded everything.
      const outcomes = (await svc.sendToUsers(
        ['u1', 'u2'],
        'wallet_refunded',
        {},
        bombDetails() as never,
      )) as Array<{ userId: string; status: string; reason?: string }>;
      expect(outcomes.length).toBe(2);
      for (const item of outcomes) {
        expect(item.status).toBe('failed');
        expect(item.reason).toBe('render-error');
      }
    } finally {
      global.fetch = realFetch;
    }
  });
});
