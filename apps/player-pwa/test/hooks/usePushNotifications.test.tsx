import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock fetcher (house pattern, cf. test/hooks/useAuth.test.tsx)
const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
}));

// Mock observability (P2-16 captureError) — keep the provider out of the test
const mockCapture = vi.fn();
vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: (...args: unknown[]) => mockCapture(...args),
}));

import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * P2-76b (run #65): push locale stays in sync with the UI locale.
 * push_subscriptions.locale is persisted at subscribe time; before this
 * slice a user who switched ar/en kept receiving pushes in the OLD
 * language until they re-subscribed by hand. The hook now re-upserts the
 * (idempotent) subscribe endpoint whenever the stored marker drifts from
 * the active locale. Locale switches remount the hook (URL-driven), so the
 * sync trigger is a localStorage marker, not a prev-value ref.
 */

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-123';

function makeSub(endpoint = ENDPOINT): PushSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } }),
    unsubscribe: vi.fn(async () => {}),
  } as unknown as PushSubscription;
}

function installBrowserStubs(activeSub: PushSubscription | null) {
  // jsdom has no Notification / serviceWorker — the hook gates on both.
  class NotificationStub {
    static permission = 'granted';
    static requestPermission = vi.fn(async () => 'granted');
  }
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: NotificationStub,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => activeSub,
        },
      }),
    },
  });
}

const MARKER = 'kl.push.syncedLocale';

describe('usePushNotifications — P2-76b push locale sync (run #65)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetcher.mockResolvedValue({});
    window.localStorage.clear();
    installBrowserStubs(makeSub());
  });

  it('re-upserts the subscription when the marker drifts from the UI locale (stale-locale fix)', async () => {
    // Simulate a user who subscribed in EN and switched to AR.
    window.localStorage.setItem(MARKER, 'en');

    const { result, rerender } = renderHook(
      ({ locale }: { locale: string }) => usePushNotifications(locale),
      { initialProps: { locale: 'ar' } },
    );

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await waitFor(() => {
      const calls = mockFetcher.mock.calls.filter(
        (c) => c[0] === '/notifications/subscribe',
      );
      expect(calls).toHaveLength(1);
    });
    const [url, init] = mockFetcher.mock.calls.find(
      (c) => c[0] === '/notifications/subscribe',
    )!;
    expect(url).toBe('/notifications/subscribe');
    const body = JSON.parse(init.body);
    expect(body.locale).toBe('ar');
    expect(body.endpoint).toBe(ENDPOINT);
    expect(window.localStorage.getItem(MARKER)).toBe('ar');

    // In-place locale change without remount (the hook must also survive
    // a rerender-driven switch — e.g. a future in-app toggle).
    rerender({ locale: 'en' });
    await waitFor(() => {
      const calls = mockFetcher.mock.calls.filter(
        (c) => c[0] === '/notifications/subscribe',
      );
      expect(calls).toHaveLength(2);
    });
    const secondBody = JSON.parse(
      mockFetcher.mock.calls.filter((c) => c[0] === '/notifications/subscribe')[1][1]
        .body,
    );
    expect(secondBody.locale).toBe('en');
    expect(window.localStorage.getItem(MARKER)).toBe('en');
  });

  it('does NOT re-upsert when the marker already matches the locale', async () => {
    window.localStorage.setItem(MARKER, 'ar');

    const { result } = renderHook(() => usePushNotifications('ar'));

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    // Let any stray effect settle.
    await waitFor(() => expect(mockFetcher).not.toHaveBeenCalled());
  });

  it('unsubscribe() POSTs the endpoint and clears the marker', async () => {
    window.localStorage.setItem(MARKER, 'ar');
    const sub = makeSub();
    installBrowserStubs(sub);

    const { result } = renderHook(() => usePushNotifications('ar'));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    mockFetcher.mockClear();

    await result.current.unsubscribe();

    expect(sub.unsubscribe).toHaveBeenCalled();
    const [url, init] = mockFetcher.mock.calls.find(
      (c) => c[0] === '/notifications/unsubscribe',
    )!;
    expect(url).toBe('/notifications/unsubscribe');
    expect(init.method).toBe('POST'); // P2-76a: never DELETE-with-body
    expect(JSON.parse(init.body)).toEqual({ endpoint: ENDPOINT });
    expect(window.localStorage.getItem(MARKER)).toBeNull();
    await waitFor(() => expect(result.current.isSubscribed).toBe(false));
  });

  it('a failed locale sync ships to Sentry and does NOT advance the marker', async () => {
    window.localStorage.setItem(MARKER, 'en');
    mockFetcher.mockImplementation((url: string) =>
      url === '/notifications/subscribe'
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({}),
    );

    renderHook(() => usePushNotifications('ar'));

    await waitFor(() => expect(mockCapture).toHaveBeenCalled());
    expect(mockCapture.mock.calls[0][1]).toMatchObject({
      scope: 'pushLocaleSync',
    });
    expect(window.localStorage.getItem(MARKER)).toBe('en');
  });
});
