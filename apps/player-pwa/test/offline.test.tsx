import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

// Mock next/navigation before importing the component
vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/offline',
}));

import Offline from '@/app/[locale]/offline/page';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

/**
 * P2-70 (run #56): the offline fallback page routes its copy through the
 * shared locale dicts (common.*) — this file pins BOTH locale renders, so a
 * regression back to hardcoded copy fails here.
 */
function renderWithLocale(locale: 'en' | 'ar') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'ar' ? ar : en}
      timeZone="Asia/Riyadh"
    >
      <Offline />
    </NextIntlClientProvider>,
  );
}

describe('Offline page', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { reload: vi.fn() });
  });

  it('renders the Arabic "no internet" heading (ar dict)', () => {
    renderWithLocale('ar');
    expect(
      screen.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت' })
    ).toBeInTheDocument();
  });

  it('renders the English heading (en dict — previously hardcoded Arabic-map only)', () => {
    renderWithLocale('en');
    expect(
      screen.getByRole('heading', { name: 'No internet connection' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Check your connection and try again')
    ).toBeInTheDocument();
  });

  it('retry button accessible name is the localized label', () => {
    renderWithLocale('en');
    expect(
      screen.getByRole('button', { name: 'Retry connection' })
    ).toBeInTheDocument();
    renderWithLocale('ar');
    expect(
      screen.getByRole('button', { name: 'إعادة المحاولة' })
    ).toBeInTheDocument();
  });

  it('clicking retry calls window.location.reload()', async () => {
    const user = userEvent.setup();
    renderWithLocale('ar');
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(window.location.reload).toHaveBeenCalledOnce();
  });
});
