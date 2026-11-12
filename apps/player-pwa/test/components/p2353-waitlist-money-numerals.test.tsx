import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';
import OngoingGameJoinSheet from '@/components/matches/OngoingGameJoinSheet';
import GameDetails from '@/components/matches/GameDetails';
import VenueReviewsSection from '@/components/venues/VenueReviewsSection';
import { formatRating } from '@/lib/format';

/**
 * P2-353 / P2-354 / P2-356 (run #203): Latin digits leaked into AR on the
 * waitlist CTA + count pill, the ongoing-game join sheet, GameDetails (which
 * also hardcoded SAR), the venue rating, and the reschedule shortfall toast.
 * Pins AR Arabic-Indic output on the components and bans the removed shapes.
 */

// Components resolve locale from the pathname (MatchCard pattern).
const nav = vi.hoisted(() => ({ pathname: '/ar/match/m1' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const reviews = vi.hoisted(() => ({ average: 4.5 }));
vi.mock('@/hooks/useVenueReviews', () => ({
  useVenueReviews: () => ({
    data: { average: reviews.average, count: 2, can_review: false, reviews: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useVenueReviewSubmit: () => ({ mutate: vi.fn(), isPending: false }),
}));

function withIntl(locale: 'ar' | 'en', ui: React.ReactNode) {
  return (
    <NextIntlClientProvider messages={locale === 'ar' ? arMessages : enMessages} locale={locale}>
      {ui}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  nav.pathname = '/ar/match/m1';
  reviews.average = 4.5;
});

describe('P2-353 — OngoingGameJoinSheet confirm button', () => {
  it('AR price renders Arabic-Indic digits with ر.س (no Latin digits)', () => {
    render(
      withIntl(
        'ar',
        <OngoingGameJoinSheet isOpen onClose={() => {}} onConfirm={() => {}} matchTitle="M" price={25} />,
      ),
    );
    const button = screen.getByText(arMessages.matchDetail.ongoingGameConfirm).closest('button');
    expect(button).not.toBeNull();
    const text = button!.textContent ?? '';
    expect(text).toContain('٢٥');
    expect(text).toContain('ر.س');
    expect(text).not.toMatch(/[0-9]/);
  });
});

describe('P2-353 — GameDetails price line', () => {
  const props = { date: 'Fri', time: '7:00 PM', hasJoined: false, isHost: false };

  it('AR renders Arabic-Indic digits + ر.س', () => {
    render(withIntl('ar', <GameDetails {...props} price={25} />));
    const priceLine = screen.getByText(/٢٥/);
    expect(priceLine.textContent).toContain('ر.س');
    expect(priceLine.textContent).not.toMatch(/[0-9]/);
  });

  it('honors the currency prop (old code hardcoded SAR)', () => {
    nav.pathname = '/en/match/m1';
    render(withIntl('en', <GameDetails {...props} price={25} currency="USD" />));
    expect(screen.getByText(/US\$\s?25|\$25/)).toBeInTheDocument();
    expect(screen.queryByText(/SAR/)).toBeNull();
  });

  it('EN keeps the Latin "SAR 25.00" shape', () => {
    nav.pathname = '/en/match/m1';
    render(withIntl('en', <GameDetails {...props} price={25} />));
    expect(screen.getByText(/SAR\s?25\.00/)).toBeInTheDocument();
  });
});

describe('P2-356 — VenueReviewsSection rating', () => {
  function renderSection(locale: 'ar' | 'en') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        {withIntl(locale, <VenueReviewsSection venueId="venue-1" locale={locale} />)}
      </QueryClientProvider>,
    );
  }

  it('AR rating renders Arabic-Indic digits (٤٫٥), no Latin digits', () => {
    renderSection('ar');
    const rating = screen.getByText('٤٫٥');
    expect(rating.textContent).not.toMatch(/[0-9]/);
  });

  it("renders '—' when there is no average yet", () => {
    reviews.average = 0;
    renderSection('ar');
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('formatRating (P2-356)', () => {
  it('formats one fraction digit per locale and blanks non-finite input', () => {
    expect(formatRating(4.5, 'ar')).toBe('٤٫٥');
    expect(formatRating(4.25, 'en')).toBe('4.3');
    expect(formatRating(NaN, 'en')).toBe('');
  });
});

describe('P2-353 — structure bans on the removed shapes', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
  const page = read('../../src/app/[locale]/match/[id]/page.tsx');
  const sheet = read('../../src/components/matches/OngoingGameJoinSheet.tsx');
  const details = read('../../src/components/matches/GameDetails.tsx');
  const reviewsSrc = read('../../src/components/venues/VenueReviewsSection.tsx');
  const actions = read('../../src/hooks/useMatchActions.ts');

  it('no bare price/currency templates', () => {
    expect(page).not.toContain('`${match.price} ${match.currency}`');
    expect(sheet).not.toContain('`${price} ${currency}`');
    expect(details).not.toContain('`${price} SAR`');
  });

  it('no bare waitlist count in the match page pill', () => {
    expect(page).not.toMatch(/>\s*\{match\.waitlistCount\}\s*</);
    expect(page).toContain('formatCount(match.waitlistCount ?? 0');
  });

  it('no toFixed( in the fixed render sites', () => {
    for (const src of [page, sheet, details, reviewsSrc, actions]) {
      expect(src).not.toContain('toFixed(');
    }
  });

  it('GameDetails caller passes the match currency', () => {
    expect(page).toContain('currency={match.currency}');
  });
});
