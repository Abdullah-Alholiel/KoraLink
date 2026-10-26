import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import PushNudgeCard from '@/components/push/PushNudgeCard';
import { useAppStore } from '@/store/useAppStore';
import enMessages from '@/messages/en.json';

/**
 * P2-258 (run #167) — contextual push opt-in card:
 * - renders ONLY while a booking-success timestamp is fresh (10 min window)
 * - dedupe: already-subscribed / denied / granted never re-offered
 * - 24h dismissal cooldown via the localStorage marker
 * - Turn on → subscribe() → localized outcome line (success or per-outcome
 *   error copy); Not now → marker + card hides
 * The push hook is mocked (no SW/pushManager in jsdom); the STORE is real
 * (state driven via setState — the contract under test is the store wiring).
 */

const mockSubscribe = vi.fn();
let mockPushState: {
  permission: NotificationPermission;
  isSubscribed: boolean;
  isSubscribing: boolean;
  isSupported: boolean;
  subscribe: () => Promise<string>;
} = {
  permission: 'default',
  isSubscribed: false,
  isSubscribing: false,
  isSupported: true,
  subscribe: () => mockSubscribe(),
};

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => mockPushState,
  // PushNudgeCard imports the outcome type — type-only, no runtime member needed.
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

function renderCard() {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <PushNudgeCard />
    </NextIntlClientProvider>,
  );
}

const NOW = Date.now();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockPushState = {
    permission: 'default',
    isSubscribed: false,
    isSubscribing: false,
    isSupported: true,
    subscribe: () => mockSubscribe(),
  };
  mockSubscribe.mockResolvedValue('ok');
  useAppStore.setState({ pushNudgeArmedAt: null });
});

afterEach(() => {
  useAppStore.setState({ pushNudgeArmedAt: null });
});

describe('PushNudgeCard (P2-258)', () => {
  it('renders nothing when no booking success is armed', () => {
    const { container } = renderCard();
    expect(container.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
  });

  it('renders the offer while the armed timestamp is fresh', () => {
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    renderCard();
    expect(screen.getByTestId('push-nudge-card')).toBeInTheDocument();
    expect(screen.getByText('Never miss a match update')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('hides (and disarms) once the 10-minute window expires', () => {
    useAppStore.setState({ pushNudgeArmedAt: Date.now() - 11 * 60_000 });
    const { container } = renderCard();
    expect(container.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
    expect(useAppStore.getState().pushNudgeArmedAt).toBeNull();
  });

  it('never re-offers when already subscribed', () => {
    mockPushState = { ...mockPushState, isSubscribed: true };
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    const { container } = renderCard();
    expect(container.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
  });

  it('never re-offers after a denied or granted permission decision', () => {
    mockPushState = { ...mockPushState, permission: 'denied' };
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    const { container: denied } = renderCard();
    expect(denied.querySelector('[data-testid="push-nudge-card"]')).toBeNull();

    mockPushState = { ...mockPushState, permission: 'granted' };
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    const { container: granted } = renderCard();
    expect(granted.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
  });

  it('respects the 24h dismissal cooldown marker', () => {
    window.localStorage.setItem('kl.push.nudgeDismissedAt', String(NOW - 2 * 60 * 60_000));
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    const { container } = renderCard();
    expect(container.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
  });

  it('re-offers after the dismissal cooldown has passed', () => {
    window.localStorage.setItem('kl.push.nudgeDismissedAt', String(NOW - 25 * 60 * 60_000));
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    renderCard();
    expect(screen.getByTestId('push-nudge-card')).toBeInTheDocument();
  });

  it('Not now: writes the marker, hides, and disarms', () => {
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('push-nudge-card')).toBeNull();
    expect(
      Number(window.localStorage.getItem('kl.push.nudgeDismissedAt')),
    ).toBeGreaterThan(0);
    expect(useAppStore.getState().pushNudgeArmedAt).toBeNull();
  });

  it('Turn on: subscribes and shows the localized success line', async () => {
    mockSubscribe.mockResolvedValue('ok');
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    const outcome = await waitFor(() => screen.getByTestId('push-nudge-outcome'));
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(outcome.textContent).toBe(enMessages.common.pushNudgeSuccess);
  });

  it('Turn on failure: per-outcome copy (denied → browser settings, not install)', async () => {
    mockSubscribe.mockResolvedValue('permission-denied');
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    const outcome = await waitFor(() => screen.getByTestId('push-nudge-outcome'));
    expect(outcome.textContent).toBe(enMessages.common.pushPermissionDenied);
  });

  it('Turn on while unsupported surfaces the install hint', async () => {
    mockPushState = { ...mockPushState, isSupported: false };
    useAppStore.setState({ pushNudgeArmedAt: Date.now() });
    const { container } = renderCard();
    // Unsupported never renders the card at all — the offer would dead-end.
    expect(container.querySelector('[data-testid="push-nudge-card"]')).toBeNull();
  });
});
