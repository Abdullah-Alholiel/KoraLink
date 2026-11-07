import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import PaymentSheet from '@/components/payment/PaymentSheet';

// ── module mocks ─────────────────────────────────────────────────────────────
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/en/match/m-1',
}));

// fetcher: URL-routed mock (skill rule — mockResolvedValueOnce is racy when
// more than one call happens in a turn).
const fetcherMock = vi.hoisted(() =>
  vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({})),
);
vi.mock('@/lib/fetcher', () => ({
  fetcher: (url: string, init?: RequestInit) => fetcherMock(url, init),
}));

// navigator.onLine control (jsdom has no real network stack; setup defaults
// to true). useOnlineStatus reads it on mount and on online/offline events.
function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
  if (online) window.dispatchEvent(new Event('online'));
  else window.dispatchEvent(new Event('offline'));
}

// jsdom has no IntersectionObserver (Next/Image internals).
class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = (globalThis as any).IntersectionObserver ?? IOStub;

function renderSheet(overrides: Partial<Parameters<typeof PaymentSheet>[0]> = {}) {
  const onPaySuccess = vi.fn();
  const onClose = vi.fn();
  const props: Parameters<typeof PaymentSheet>[0] = {
    isOpen: true,
    onClose,
    onPaySuccess,
    matchTitle: '7v11 Casual',
    matchTime: 'Fri, 23 Oct — 20:00',
    matchLocation: 'Riyadh Arena',
    matchId: 'm-1',
    price: 50,
    currency: 'SAR',
    walletBalance: 100,
    ...overrides,
  };
  const utils = render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <PaymentSheet {...props} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onPaySuccess, onClose };
}

async function agree() {
  // The consent checkbox is the only border-2 button in the agree row; find
  // it by its accessible position (first button after the policy text).
  const buttons = screen.getAllByRole('button');
  const agreeBtn = buttons.find((b) => b.closest('div')?.textContent?.includes('Disclaimer:'));
  // Fallback: it is the button directly before the "Read full policy" button.
  const target =
    agreeBtn ??
    buttons[buttons.findIndex((b) => b.textContent === 'Read full policy') - 1];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  await userEvent.click(target!);
}

describe('PaymentSheet — P2-228 localized failure copy + offline guard', () => {
  beforeEach(() => {
    setOnline(true);
    fetcherMock.mockReset();
    fetcherMock.mockImplementation(() => Promise.resolve({}));
    pushMock.mockReset();
  });

  afterEach(() => {
    setOnline(true);
  });

  it('renders the full consent text (no 80-char truncation) with a Read full policy expander (P2-235)', async () => {
    renderSheet();
    const fullText = enMessages.host.disclaimerText as string;
    // the FULL text is present in BOTH render sites (refund-policy box +
    // consent line) — was: consent line slice(0, 80) + '...'
    expect(screen.getAllByText(fullText).length).toBeGreaterThanOrEqual(2);
    const toggle = screen.getByRole('button', { name: 'Read full policy' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('happy path: pay calls the join endpoint and fires onPaySuccess', async () => {
    const { onPaySuccess } = renderSheet();
    await agree();
    await userEvent.click(screen.getByRole('button', { name: /Pay with Wallet/i }));
    await waitFor(() => expect(onPaySuccess).toHaveBeenCalledTimes(1));
    expect(fetcherMock).toHaveBeenCalledWith(
      '/matches/m-1/join',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('network failure shows the localized network copy + the no-money reassurance', async () => {
    fetcherMock.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    renderSheet();
    await agree();
    await userEvent.click(screen.getByRole('button', { name: /Pay with Wallet/i }));
    await waitFor(() =>
      expect(
        screen.getByText(enMessages.errors.network as string),
      ).toBeInTheDocument(),
    );
    // money-flow reassurance is ALWAYS shown on failure
    expect(screen.getByText(enMessages.payment.noMoneyTaken as string)).toBeInTheDocument();
  });

  it('server 409 failure shows the localized conflict copy (not raw backend English)', async () => {
    fetcherMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Slot already taken by another player'), {
          status: 409,
        }),
      ),
    );
    renderSheet();
    await agree();
    await userEvent.click(screen.getByRole('button', { name: /Pay with Wallet/i }));
    await waitFor(() =>
      expect(screen.getByText(enMessages.errors.conflict as string)).toBeInTheDocument(),
    );
    expect(screen.getByText(enMessages.payment.noMoneyTaken as string)).toBeInTheDocument();
    // the raw backend message must NEVER render
    expect(screen.queryByText(/Slot already taken by another player/)).toBeNull();
  });

  it('offline: CTA disabled with network copy + offline banner; tap is a no-op', async () => {
    setOnline(false);
    renderSheet();
    const cta = screen.getByRole('button', { name: enMessages.errors.network as string });
    expect(cta).toBeDisabled();
    // offline strip renders inside the sheet
    expect(screen.getByText(enMessages.common.offlineBanner as string)).toBeInTheDocument();
    // agree + click anyway (event-time guard)
    await agree();
    await userEvent.click(cta);
    expect(fetcherMock).not.toHaveBeenCalled();
  });

  it('going offline AFTER a failure keeps the failure + reassurance visible', async () => {
    fetcherMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('boom'), { status: 500 })),
    );
    renderSheet();
    await agree();
    await userEvent.click(screen.getByRole('button', { name: /Pay with Wallet/i }));
    await waitFor(() =>
      expect(screen.getByText(enMessages.errors.server as string)).toBeInTheDocument(),
    );
    setOnline(false);
    expect(screen.getByText(enMessages.payment.noMoneyTaken as string)).toBeInTheDocument();
    expect(screen.getByText(enMessages.errors.server as string)).toBeInTheDocument();
  });
});
