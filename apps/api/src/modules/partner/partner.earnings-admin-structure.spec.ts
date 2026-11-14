import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structure regression guard — admin partner earnings revenue overview (P1-65).
 *
 * apps/admin has no test harness, so the admin surface is pinned here (same
 * lightweight source-structure style as apps/player-pwa test/structure/*).
 */
const ADMIN_ROOT = join(__dirname, '..', '..', '..', '..', 'admin');
const src = (p: string) => readFileSync(join(ADMIN_ROOT, p), 'utf8');
type Messages = { partner: { earnings: Record<string, string> } };
const messages = (locale: string) => JSON.parse(src(`src/messages/${locale}.json`)) as Messages;

const NEW_KEYS = [
  'revenueOverviewTitle',
  'revenueOverviewSubtitle',
  'fourWeekRevenue',
  'utilization',
  'perVenueTitle',
  'thBookings',
  'thRevenue',
  'noRevenueData',
];

describe('admin partner earnings revenue overview (P1-65)', () => {
  const page = src('src/app/(dashboard)/partner/earnings/page.tsx');

  it('renders every new partner.earnings key', () => {
    for (const key of NEW_KEYS) expect(page).toContain(`t('${key}')`);
  });

  it('adds the 4-week revenue + utilization MetricCards above the settlements table', () => {
    const revenueCard = page.indexOf("label={t('fourWeekRevenue')}");
    const utilCard = page.indexOf("label={t('utilization')}");
    const settlements = page.indexOf("t('settlementsTitle')");
    expect(revenueCard).toBeGreaterThan(-1);
    expect(utilCard).toBeGreaterThan(-1);
    expect(revenueCard).toBeLessThan(settlements);
    expect(utilCard).toBeLessThan(settlements);
    expect(page).toContain('<WeeklyTrendChart data={trendPoints} />');
    expect(page.indexOf('<WeeklyTrendChart')).toBeLessThan(settlements);
  });

  it('data comes from the single existing live hook — no new fetch paths', () => {
    expect(page.match(/useLiveAdminData</g)).toHaveLength(1);
    expect(page).toContain("'/partner/earnings'");
    expect(page).not.toMatch(/\bfetch\(/);
    expect(page).not.toContain('apiFetch(');
  });

  it('EN/AR partner.earnings parity with non-empty copy', () => {
    const en = messages('en').partner.earnings;
    const ar = messages('ar').partner.earnings;
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const key of NEW_KEYS) {
      expect(en[key]).toBeTruthy();
      expect(ar[key]).toBeTruthy();
      expect(ar[key]).not.toEqual(en[key]);
    }
  });

  it('PartnerEarnings type carries the new fields', () => {
    const types = src('src/lib/types.ts');
    for (const field of ['perVenue: PartnerVenueRevenue[]', 'fourWeekTrend: PartnerRevenueWeek[]', 'utilizationPct: number']) {
      expect(types).toContain(field);
    }
  });
});
