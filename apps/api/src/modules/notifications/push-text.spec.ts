/**
 * P2-8 (run #24): push-text catalog — per-locale title/body rendering.
 * Pure unit tests: no DB, no web-push mocks. Pins the contract that every
 * key × locale pair renders non-empty text, locale fallback ('ar' → ar,
 * everything else → en), and per-locale kickoff formatting on the
 * Asia/Riyadh wall clock.
 */
import { normalizePushLocale, renderPushText, type PushKey } from './push-text';

const ALL_KEYS: PushKey[] = [
  'match_starting_soon',
  'players_needed',
  'players_needed_renudge',
  'match_cancelled',
  'match_rescheduled',
  'player_removed',
  'pom_decided',
  'report_resolved',
  'report_dismissed',
  'refund_credited',
  'payout_released',
];

describe('normalizePushLocale (P2-8)', () => {
  it('maps ar → ar and everything else → en', () => {
    expect(normalizePushLocale('ar')).toBe('ar');
    expect(normalizePushLocale('en')).toBe('en');
    expect(normalizePushLocale('fr')).toBe('en'); // unknown → English fallback
    expect(normalizePushLocale(null)).toBe('en');
    expect(normalizePushLocale(undefined)).toBe('en');
    expect(normalizePushLocale('')).toBe('en');
  });
});

describe('renderPushText catalog totality (P2-8)', () => {
  it('renders non-empty title+body for every key × locale pair', () => {
    for (const key of ALL_KEYS) {
      for (const locale of ['en', 'ar'] as const) {
        const { title, body } = renderPushText(
          key,
          { title: 'T', needed: 2, winnerName: 'W', kickoffISO: '2026-09-01T17:30:00Z' },
          locale,
        );
        expect(title.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('renderPushText per-locale content (P2-8)', () => {
  it('players_needed: English plural vs Arabic wording, embedded title', () => {
    const en = renderPushText('players_needed', { title: 'Friday 7s', needed: 2 }, 'en');
    expect(en.title).toBe('📣 Players needed');
    expect(en.body).toContain('"Friday 7s"');
    expect(en.body).toContain('2 more players');

    const enOne = renderPushText('players_needed', { title: 'Friday 7s', needed: 1 }, 'en');
    expect(enOne.body).toContain('1 more player —'); // singular, no 's'

    const ar = renderPushText('players_needed', { title: 'Friday 7s', needed: 2 }, 'ar');
    expect(ar.title).toBe('📣 لاعبون مطلوبون');
    expect(ar.body).toContain('"Friday 7s"');
    expect(ar.body).toContain('لاعبين إضافيين');
  });

  it('match_starting_soon: kickoff rendered per-locale on the Riyadh clock (17:30Z = 20:30 AST)', () => {
    const iso = '2026-09-01T17:30:00Z'; // 20:30 Asia/Riyadh
    const en = renderPushText('match_starting_soon', { title: 'Cup night', kickoffISO: iso }, 'en');
    expect(en.title).toBe('⏰ Match starting soon');
    expect(en.body).toContain('20:30');

    const ar = renderPushText('match_starting_soon', { title: 'Cup night', kickoffISO: iso }, 'ar');
    expect(ar.title).toBe('⏰ المباراة تبدأ قريبًا');
    expect(ar.body).toContain('تبدأ الساعة'); // Arabic phrasing present (digits may be Arabic-Indic per ar-SA)
  });

  it('pom_decided + report keys: localized titles', () => {
    expect(renderPushText('pom_decided', { winnerName: 'Saud' }, 'en').title).toBe(
      '🏆 Player of the Match',
    );
    expect(renderPushText('pom_decided', { winnerName: 'سعود' }, 'ar').title).toBe(
      '🏆 أفضل لاعب في المباراة',
    );
    expect(renderPushText('report_resolved', {}, 'ar').title).toBe('تحديث البلاغ');
    expect(renderPushText('report_dismissed', {}, 'en').title).toBe('Report update');
  });

  it('missing vars never throw — fallbacks keep the sentence intact', () => {
    const { title, body } = renderPushText('players_needed_renudge', {}, 'ar');
    expect(title).toBe('📣 لاعبون مطلوبون');
    expect(body).toContain('مباراتك'); // title fallback
  });

  // P2-193 (run #155): player money flows — wallet credits get a voice.
  // NOTE: Intl narrowSymbol separates the code/symbol from the digits with
  // U+00A0 (non-breaking space) — the expected strings below use \u00A0.
  it('refund_credited: quotes the exact per-locale amount + match title', () => {
    const en = renderPushText('refund_credited', { title: 'Friday 7s', amount: '37' }, 'en');
    expect(en.title).toBe('💸 Money returned');
    expect(en.body).toContain('SAR\u00A037.00'); // Intl narrowSymbol, en
    expect(en.body).toContain('"Friday 7s"');

    const ar = renderPushText('refund_credited', { title: 'Friday 7s', amount: '37' }, 'ar');
    expect(ar.title).toBe('💸 تم إرجاع المبلغ');
    expect(ar.body).toContain('٣٧٫٠٠'); // Arabic-Indic digits (marketing standard)
    expect(ar.body).toContain('ر.س');
    expect(ar.body).toContain('"Friday 7s"');
  });

  it('payout_released: host copy quotes the released amount', () => {
    const en = renderPushText('payout_released', { title: 'Cup night', amount: '3150' }, 'en');
    expect(en.title).toBe('💸 Payout released');
    expect(en.body).toContain('SAR\u00A03,150.00');

    const ar = renderPushText('payout_released', { title: 'Cup night', amount: '3150' }, 'ar');
    expect(ar.title).toBe('💸 تم صرف المستحقات');
    expect(ar.body).toContain('٣٬١٥٠٫٠٠');
  });

  it('refund_credited/payout_released: missing amount renders the zero datum, never throws', () => {
    // payoutAmount's TOTAL contract (P1-67): a MISSING amount is a data bug →
    // bare localized "0.00", never a fabricated currency-prefixed value.
    expect(renderPushText('refund_credited', { title: 'T' }, 'en').body).toContain('0.00');
    // Missing amount = the passthrough raw string (P1-67 contract), ASCII here.
    expect(renderPushText('payout_released', {}, 'ar').body).toContain('0.00');
  });
});
