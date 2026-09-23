import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

// Mock next/navigation before importing the component (page imports trackEvent
// → ObservabilityProvider → next/navigation side effects).
vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/offline',
}));

import Offline from '@/app/[locale]/offline/page';
import { useAppStore } from '@/store/useAppStore';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

/**
 * P2-73 (run #64): the offline page grew a "back to the page" restore CTA.
 * This file pins the NEW behavior; the P2-70 copy contract (common.* keys)
 * was already pinned by test/offline.test.tsx and stays intact.
 */

const readMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sw-offline-restore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sw-offline-restore')>();
  return {
    ...actual,
    readRestoreEntry: readMock,
  };
});

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

const setup = ({ online }: { online: boolean }) => {
  vi.stubGlobal('navigator', { onLine: online });
  return vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
};

describe('Offline page — restore CTA (P2-73)', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      reload: vi.fn(),
      assign: vi.fn(),
    });
    useAppStore.setState({ toast: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    readMock.mockReset();
  });

  it('hides the restore CTA when nothing was saved (pure P2-70 screen)', async () => {
    readMock.mockResolvedValue(null);
    setup({ online: true });
    renderWithLocale('en');
    await waitFor(() => expect(readMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Back to the page' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument();
  });

  it('shows the restore CTA when a URL was saved and navigates to it (online)', async () => {
    readMock.mockResolvedValue({ url: 'https://host.test/ar/match/m1', savedAt: Date.now() - 60_000 });
    const assign = setup({ online: true });
    renderWithLocale('en');
    const cta = await screen.findByRole('button', { name: 'Back to the page' });
    await userEvent.setup().click(cta);
    expect(assign).toHaveBeenCalledWith('https://host.test/ar/match/m1');
  });

  it('CTA press while still offline shows the localized error toast, no navigation', async () => {
    readMock.mockResolvedValue({ url: 'https://host.test/ar/match/m1', savedAt: Date.now() - 60_000 });
    const assign = setup({ online: false });
    renderWithLocale('en');
    const cta = await screen.findByRole('button', { name: 'Back to the page' });
    await userEvent.setup().click(cta);
    expect(assign).not.toHaveBeenCalled();
    const toast = useAppStore.getState().toast;
    expect(toast?.message).toBe("You're still offline");
    expect(toast?.type).toBe('error');
    expect(toast?.meta?.detail).toBe('Reconnect to the internet, then try again.');
  });

  it('Arabic copy renders RTL-localized CTA (ar dict)', async () => {
    readMock.mockResolvedValue({ url: 'https://host.test/ar/match/m1', savedAt: Date.now() - 60_000 });
    setup({ online: true });
    renderWithLocale('ar');
    expect(await screen.findByRole('button', { name: 'العودة إلى الصفحة' })).toBeInTheDocument();
  });

  it('fresh save + offline shows the still-offline toast once on landing', async () => {
    readMock.mockResolvedValue({ url: 'https://host.test/ar/match/m1', savedAt: Date.now() });
    setup({ online: false });
    renderWithLocale('en');
    await waitFor(() => {
      expect(useAppStore.getState().toast?.type).toBe('error');
    });
    expect(useAppStore.getState().toast?.message).toBe("You're still offline");
  });
});
