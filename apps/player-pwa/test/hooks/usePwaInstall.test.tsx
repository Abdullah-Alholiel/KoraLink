import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { trackEvent } from '@/providers/ObservabilityProvider';

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
}));

// ── MatchMedia stub (jsdom lacks it) ─────────────────────────
const mqListeners: ((e: { matches: boolean }) => void)[] = [];
const mockMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mqListeners.push(cb),
    removeEventListener: vi.fn(),
  }));

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126';

function stubNavigator({ ua, standalone }: { ua: string; standalone?: boolean }) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    get: () => standalone,
  });
}

function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt');
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mqListeners.length = 0;
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', mockMatchMedia(false)); // not standalone
    stubNavigator({ ua: DESKTOP_UA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides the banner in standalone mode even when installable', async () => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true)); // standalone
    const { result } = renderHook(() => usePwaInstall());
    fireBeforeInstallPrompt();
    await waitFor(() => expect(result.current.canInstall).toBe(true));
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.shouldShowBanner).toBe(false);
  });

  it('shows the banner when beforeinstallprompt fires (desktop Chromium)', async () => {
    const { result } = renderHook(() => usePwaInstall());
    fireBeforeInstallPrompt();
    await waitFor(() => expect(result.current.shouldShowBanner).toBe(true));
    expect(result.current.canInstall).toBe(true);
  });

  it('shows the banner for iOS non-standalone without beforeinstallprompt', async () => {
    stubNavigator({ ua: IOS_UA });
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isIos).toBe(true));
    await waitFor(() => expect(result.current.shouldShowBanner).toBe(true));
    expect(result.current.canInstall).toBe(false);
  });

  it('hides the banner within the 7-day dismiss cooldown', async () => {
    window.localStorage.setItem(
      'koralink.install-banner-dismissed-at',
      String(Date.now() - 1000), // dismissed 1s ago
    );
    stubNavigator({ ua: IOS_UA });
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isIos).toBe(true));
    expect(result.current.shouldShowBanner).toBe(false);
  });

  it('shows the banner again after the cooldown expires', async () => {
    window.localStorage.setItem(
      'koralink.install-banner-dismissed-at',
      String(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
    );
    stubNavigator({ ua: IOS_UA });
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowBanner).toBe(true));
  });

  it('dismiss() persists the timestamp and tracks the event', async () => {
    stubNavigator({ ua: IOS_UA });
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowBanner).toBe(true));

    act(() => {
      result.current.dismiss();
    });
    expect(window.localStorage.getItem('koralink.install-banner-dismissed-at')).toBeTruthy();
    expect(result.current.shouldShowBanner).toBe(false);
    expect(trackEvent).toHaveBeenCalledWith('pwa_install_dismissed', { platform: 'ios_safari' });
  });

  it('promptInstall() triggers the native prompt and tracks the outcome', async () => {
    const { result } = renderHook(() => usePwaInstall());
    const event = fireBeforeInstallPrompt();
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    await act(async () => {
      await result.current.promptInstall();
    });
    expect(event.prompt).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('pwa_install_prompt_result', { outcome: 'accepted' });
  });

  it('returns false from promptInstall when no prompt is available', async () => {
    const { result } = renderHook(() => usePwaInstall());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.promptInstall();
    });
    expect(ok).toBe(false);
  });
});
