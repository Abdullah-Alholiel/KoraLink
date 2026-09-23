import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import BlockedCard, {
  extractSuspendedUntil,
} from '@/components/auth/BlockedCard';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

/**
 * P1-47 (run #56) — BlockedCard renders the localized blocked-account state.
 * Both locales render through the real message dicts (what happened + why +
 * what to do next), and suspension dates format through lib/format.ts.
 */
function renderCard(ui: React.ReactElement, locale: 'en' | 'ar') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'ar' ? ar : en}
      timeZone="Asia/Riyadh"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('extractSuspendedUntil', () => {
  it('parses the exact production shape (ISO + Z, trailing period)', () => {
    expect(
      extractSuspendedUntil('Account suspended until 2026-09-20T14:30:00.000Z.'),
    ).toBe('2026-09-20T14:30:00.000Z');
  });

  it('parses an ISO datetime from the guard message', () => {
    expect(
      extractSuspendedUntil('Account suspended until 2026-09-20T14:30:00.000Z'),
    ).toBe(new Date('2026-09-20T14:30:00.000Z').toISOString());
  });

  it('parses a bare date (midnight local)', () => {
    expect(extractSuspendedUntil('Account suspended until 2026-09-20')).toBe(
      new Date('2026-09-20').toISOString(),
    );
  });

  it('returns null for non-dated / non-string messages', () => {
    expect(extractSuspendedUntil('Account banned.')).toBeNull();
    expect(extractSuspendedUntil(undefined)).toBeNull();
    expect(extractSuspendedUntil(null)).toBeNull();
  });
});

describe('BlockedCard (EN)', () => {
  it('renders banned state with sign-out wired', () => {
    const onSignOut = vi.fn();
    renderCard(
      <BlockedCard reason="banned" locale="en" onSignOut={onSignOut} />,
      'en',
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Account restricted')).toBeInTheDocument();
    expect(screen.getByText('Your account has been banned')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders suspended state with a formatted end date', () => {
    renderCard(
      <BlockedCard
        reason="suspended"
        suspendedUntil="2026-09-20T14:30:00.000Z"
        locale="en"
        onSignOut={() => {}}
      />,
      'en',
    );
    expect(
      screen.getByText('Your account is temporarily suspended'),
    ).toBeInTheDocument();
    // The {date} interpolates into the body sentence — match the prefix +
    // day/month, tolerant of the time part that follows the date.
    const body = screen.getByText((_, el) =>
      el?.tagName === 'P' && el.textContent?.startsWith('You can sign in again after') === true,
    );
    expect(body).toBeInTheDocument();
    // en-GB short month for September is "Sept"
    expect(body.textContent).toMatch(/20 Sept? 2026/);
  });

  it('suspended WITHOUT a parseable date falls back to the no-date body', () => {
    renderCard(
      <BlockedCard reason="suspended" suspendedUntil={null} locale="en" onSignOut={() => {}} />,
      'en',
    );
    expect(
      screen.getByText(
        'You can sign in again once the suspension ends. Your matches and wallet are untouched.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the deleted state with restore guidance', () => {
    renderCard(
      <BlockedCard reason="deleted" locale="en" onSignOut={() => {}} />,
      'en',
    );
    expect(screen.getByText('Account scheduled for deletion')).toBeInTheDocument();
  });

  it('renders the banned state in Arabic with RTL dictionary copy', () => {
    renderCard(
      <BlockedCard reason="banned" locale="ar" onSignOut={() => {}} />,
      'ar',
    );
    expect(screen.getByText('الحساب مقيّد')).toBeInTheDocument();
    expect(screen.getByText('تم حظر حسابك')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'العودة لتسجيل الدخول' }));
  });
});
