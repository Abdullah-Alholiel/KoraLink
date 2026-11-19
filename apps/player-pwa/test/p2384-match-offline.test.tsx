import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import OfflineBanner from '@/components/layout/OfflineBanner';
import en from '../src/messages/en.json';
import ar from '../src/messages/ar.json';

// Run #217 (P2-384) tripwire for the match-detail offline state, following
// verify-page.offline-locale.test.tsx (P2-378): the page must keep the shared
// OfflineBanner bound to the live useOnlineStatus() result, surface the
// localized matchDetail.offlineNotice when it has no data / blocks a join
// offline, and never fork into a hand-rolled inline banner.

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');
const src = read('src/app/[locale]/match/[id]/page.tsx');

type Messages = Record<string, unknown>;

const countLeaves = (node: unknown): number => {
  if (node && typeof node === 'object') {
    return Object.values(node as Messages).reduce<number>(
      (sum, child) => sum + countLeaves(child),
      0,
    );
  }
  return 1;
};

const EN_NOTICE = "You're offline — check your connection, then try again.";
const AR_NOTICE = 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة ثم أعد المحاولة.';

/** Mirrors the page's banner wiring: no match data → matchDetail.offlineNotice. */
function MatchOfflineHarness({ isOnline, hasMatch }: { isOnline: boolean; hasMatch: boolean }) {
  const t = useTranslations();
  return (
    <OfflineBanner
      isOffline={!isOnline}
      message={hasMatch ? undefined : t('matchDetail.offlineNotice')}
      className="mx-4 mt-2"
    />
  );
}

const renderIn = (locale: 'en' | 'ar', isOnline: boolean, hasMatch = false) =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en}>
      <MatchOfflineHarness isOnline={isOnline} hasMatch={hasMatch} />
    </NextIntlClientProvider>,
  );

describe('match detail — offline state tripwire (run #217 P2-384)', () => {
  it('binds OfflineBanner to the shared useOnlineStatus() hook', () => {
    expect(src).toMatch(/import\s*\{\s*useOnlineStatus\s*\}\s*from\s*'@\/hooks\/useOnlineStatus'/);
    expect(src).toContain('const isOnline = useOnlineStatus();');
    expect(src).toMatch(/<OfflineBanner\s[^>]*isOffline=\{!isOnline\}/);
  });

  it('imports the banner from the shared component — no hand-rolled inline banner', () => {
    expect(src).toMatch(/import\s+OfflineBanner\s+from\s+'@\/components\/layout\/OfflineBanner'/);
    expect(src).not.toMatch(/function\s+OfflineBanner\b/);
    expect(src).not.toMatch(/const\s+OfflineBanner\s*=/);
    expect(src).not.toContain('WifiOff');
  });

  it('surfaces matchDetail.offlineNotice (banner w/o data, error state, join gate)', () => {
    const uses = src.match(/t\('matchDetail\.offlineNotice'\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    // Join is blocked offline before any sheet/mutation opens.
    expect(src).toMatch(/handleJoinClick = \(\) => \{[\s\S]*?if \(!isOnline\) \{[\s\S]*?offlineNotice[\s\S]*?return;/);
    // Error branch keeps the classified copy online.
    expect(src).toContain('t(errorKey(classifyError(error)))');
  });

  it('matchDetail.offlineNotice exists in en + ar with whole-file leaf parity', () => {
    expect((en as Messages & { matchDetail: Messages }).matchDetail.offlineNotice).toBe(EN_NOTICE);
    expect((ar as Messages & { matchDetail: Messages }).matchDetail.offlineNotice).toBe(AR_NOTICE);
    expect(countLeaves(ar)).toBe(countLeaves(en));
    expect(countLeaves((ar as Messages).matchDetail)).toBe(countLeaves((en as Messages).matchDetail));
  });

  it('renders nothing while online', () => {
    const { container } = renderIn('en', true);
    expect(container.textContent).toBe('');
  });

  it('renders the EN offline notice for the en locale', () => {
    renderIn('en', false);
    expect(screen.getByRole('status').textContent).toBe(EN_NOTICE);
  });

  it('renders the AR offline notice for the ar locale', () => {
    renderIn('ar', false);
    expect(screen.getByRole('status').textContent).toBe(AR_NOTICE);
  });

  it('falls back to the generic cached-data line when match data exists', () => {
    renderIn('ar', false, true);
    expect(screen.getByRole('status').textContent).toBe(
      (ar as Messages & { common: Messages }).common.offlineBanner,
    );
  });
});
