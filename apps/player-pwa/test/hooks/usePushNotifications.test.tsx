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

import {
  usePushNotifications,
  type PushSubscribeOutcome,
} from '@/hooks/usePushNotifications';

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
          // P2-91: the outcome-contract tests drive subscribe() end-to-end.
          subscribe: vi.fn(async () => makeSub()),
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

  // ── P2-87 (run #67): the OFF switch must tell the truth ──
  it('P2-87: unsubscribe() resolves true on success and flips isUnsubscribing during flight', async () => {
    window.localStorage.setItem(MARKER, 'ar');
    const sub = makeSub();
    installBrowserStubs(sub);

    // Hold the POST in flight so the pending flag is observable.
    let releaseFetch!: (v: unknown) => void;
    mockFetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFetch = resolve;
        }),
    );

    const { result } = renderHook(() => usePushNotifications('ar'));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    mockFetcher.mockClear();

    let outcome: boolean | undefined;
    const inFlight = result.current.unsubscribe().then((ok) => {
      outcome = ok;
    });

    await waitFor(() => expect(result.current.isUnsubscribing).toBe(true));
    releaseFetch({});
    await inFlight;

    expect(outcome).toBe(true);
    await waitFor(() => expect(result.current.isUnsubscribing).toBe(false));
    await waitFor(() => expect(result.current.isSubscribed).toBe(false));
  });

  it('P2-87: unsubscribe() resolves false on failure and keeps the subscription', async () => {
    window.localStorage.setItem(MARKER, 'ar');
    const sub = makeSub();
    installBrowserStubs(sub);

    const { result } = renderHook(() => usePushNotifications('ar'));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    mockFetcher.mockClear();

    mockFetcher.mockImplementation(() =>
      Promise.reject(new Error('network down')),
    );

    await expect(result.current.unsubscribe()).resolves.toBe(false);

    expect(mockCapture).toHaveBeenCalled();
    // The browser subscription was never released — pushes keep flowing and
    // the toggle stays ON so the user can retry.
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MARKER)).toBe('ar');
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(result.current.isUnsubscribing).toBe(false);
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

/**
 * P2-91 (run #69): subscribe() previously collapsed three different
 * fixable-but-distinct failures into a bare `false`, and the only consumer
 * told EVERY failure "install the PWA" — a dead end for a user whose browser
 * permission was denied (recovery = browser settings, not an install). The
 * hook now returns a PushSubscribeOutcome; these tests pin the outcome
 * contract per failure mode.
 */
describe('usePushNotifications — P2-91 subscribe outcome contract (run #69)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetcher.mockResolvedValue({});
    window.localStorage.clear();
    installBrowserStubs(null);
  });

  async function subscribeOutcome(): Promise<string> {
    const { result } = renderHook(() => usePushNotifications('en'));
    let outcome: string | undefined;
    await result.current.subscribe().then((o: PushSubscribeOutcome) => {
      outcome = o;
    });
    return outcome as string;
  }

  it("standalone browser + granted permission + clean POST → 'ok'", async () => {
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    // installBrowserStubs' NotificationStub defaults to granted.
    expect(await subscribeOutcome()).toBe('ok');
    expect(
      mockFetcher.mock.calls.some((c) => c[0] === '/notifications/subscribe'),
    ).toBe(true);
  });

  it("permission request refused → 'permission-denied' (not the install hint)", async () => {
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    class DeniedStub {
      static permission = 'default';
      static requestPermission = vi.fn(async () => 'denied');
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: DeniedStub,
    });

    expect(await subscribeOutcome()).toBe('permission-denied');
    // Nothing reached the backend and no browser subscription was created.
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("browser permission already 'denied' → 'permission-denied'", async () => {
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    class DeniedStub {
      static permission = 'denied';
      static requestPermission = vi.fn(async () => 'denied');
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: DeniedStub,
    });

    expect(await subscribeOutcome()).toBe('permission-denied');
  });

  it("not in the installed (standalone) surface → 'not-installed'", async () => {
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;

    expect(await subscribeOutcome()).toBe('not-installed');
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("push subscription throws → 'error' + Sentry capture", async () => {
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.reject(new Error('sw dead')),
      },
    });

    expect(await subscribeOutcome()).toBe('error');
    await waitFor(() =>
      expect(
        mockCapture.mock.calls.some(
          (c) => c[1] && (c[1] as { scope?: string }).scope === 'pushSubscribe',
        ),
      ).toBe(true),
    );
  });

  it('P2-92: a successful subscribe mirrors the locale into the worker-readable KV', async () => {
    const cachePut = vi.fn(async () => undefined);
    const cacheOpen = vi.fn(async () => ({ put: cachePut }));
    // jsdom has no CacheStorage — stub the global the hook writes through.
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: cacheOpen },
    });
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;

    const { result } = renderHook(() => usePushNotifications('ar'));
    await result.current.subscribe();

    await waitFor(() => expect(cachePut).toHaveBeenCalled());
    expect(cacheOpen).toHaveBeenCalledWith('koralink-push-meta');
    const calls = cachePut.mock.calls as unknown as [string, Response][];
    const [key, response] = calls[0];
    expect(key).toBe('/__kl/push-locale');
    const body = await (response as Response).json();
    expect(body).toEqual({ l: 'ar' });
  });

  it('run #70: the same KV also carries the API base + VAPID key for rotation', async () => {
    const cachePut = vi.fn(async () => undefined);
    const cacheOpen = vi.fn(async () => ({ put: cachePut }));
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: cacheOpen },
    });
    installBrowserStubs(null);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;

    const { result } = renderHook(() => usePushNotifications('en'));
    await result.current.subscribe();

    await waitFor(() => expect(cachePut).toHaveBeenCalled());
    const calls = cachePut.mock.calls as unknown as [string, Response][];
    expect(calls.length).toBe(3);
    const keys = calls.map(([k]) => k);
    expect(keys).toEqual([
      '/__kl/push-locale',
      '/__kl/push-api-base',
      '/__kl/push-vapid',
    ]);
    const apiBaseBody = (await calls[1][1].json()) as { b: string };
    expect(typeof apiBaseBody.b).toBe('string');
    expect(apiBaseBody.b.length).toBeGreaterThan(0);
    const vapidBody = (await calls[2][1].json()) as { k: string };
    // Must be the SAME public key the page subscribes with (the rotation
    // must re-subscribe against the key the server actually has).
    expect(vapidBody.k).toBe(
      'BEl62iUYgU4x0mQDmvYFz9xSYmIqtrmHQ0IKcJqH2m5RjNK0QPlZcR-JxpjMQm4oBmSmmCm8FzWcMjQBjNt2jJc',
    );
  });
});
