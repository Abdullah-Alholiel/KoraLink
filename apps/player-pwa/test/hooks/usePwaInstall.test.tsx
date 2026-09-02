import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
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

  // ── Install-landing gate (Gate 3 §2) ──────────────────────────

  it('shows the landing for a fresh browser visitor', async () => {
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowLanding).toBe(true));
    expect(result.current.isStandalone).toBe(false);
  });

  it('never shows the landing in standalone mode', async () => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowLanding).toBe(false);
    expect(result.current.shouldShowBanner).toBe(false);
  });

  it('suppresses the landing within the 30-day dismissal window', async () => {
    window.localStorage.setItem(
      'koralink.install-landing-dismissed-at.v2',
      String(Date.now() - 1000),
    );
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowLanding).toBe(false));
  });

  it('shows the landing again after 31 days', async () => {
    window.localStorage.setItem(
      'koralink.install-landing-dismissed-at.v2',
      String(Date.now() - 31 * 24 * 60 * 60 * 1000),
    );
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowLanding).toBe(true));
  });

  it('dismissLanding() writes the 30d flag and tags the event surface', async () => {
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowLanding).toBe(true));

    act(() => {
      result.current.dismissLanding();
    });
    expect(window.localStorage.getItem('koralink.install-landing-dismissed-at.v2')).toBeTruthy();
    expect(result.current.shouldShowLanding).toBe(false);
    expect(trackEvent).toHaveBeenCalledWith(
      'pwa_install_dismissed',
      expect.objectContaining({ surface: 'landing' }),
    );
  });

  it('re-detects standalone when the media query flips (post-install handoff)', async () => {
    const mqMock = mockMatchMedia(false);
    vi.stubGlobal('matchMedia', mqMock);
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(false));

    // Simulate: user accepted the install in another window; Chromium flips
    // the display-mode media query → the MQL object's matches flips true and
    // the change listener fires. The hook re-reads mq.matches (real behavior).
    const mqInstance = mqMock.mock.results[0].value;
    mqInstance.matches = true;
    await act(async () => {
      mqListeners.forEach((cb) => cb({ matches: true }));
    });
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowLanding).toBe(false);
  });

  // ── Welcome checkpoint gate (Gate 3 §1.2) ─────────────────────

  it('shows welcome on the first standalone launch for a fresh user', async () => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowWelcome).toBe(true);
  });

  it('never shows welcome to a returning standalone user', async () => {
    window.localStorage.setItem('koralink.pwa-seen-app-before', String(Date.now()));
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowWelcome).toBe(false);
  });

  it('never shows welcome to an existing app user after install (legacy evidence)', async () => {
    window.localStorage.setItem('koralink-app-store', '{"state":{"preferences":{}}}');
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowWelcome).toBe(false);
  });

  it('markWelcomeSeen() writes BOTH gate keys in one call', async () => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.shouldShowWelcome).toBe(true));

    act(() => {
      result.current.markWelcomeSeen();
    });
    expect(window.localStorage.getItem('koralink.pwa-welcome-seen')).toBeTruthy();
    expect(window.localStorage.getItem('koralink.pwa-seen-app-before')).toBeTruthy();
    expect(result.current.shouldShowWelcome).toBe(false);
  });

  it('appinstalled clears the welcome flag so the next standalone launch greets once', async () => {
    window.localStorage.setItem('koralink.pwa-welcome-seen', String(Date.now() - 1000));
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    const { result } = renderHook(() => usePwaInstall());
    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.shouldShowWelcome).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(window.localStorage.getItem('koralink.pwa-welcome-seen')).toBeNull();
    expect(result.current.shouldShowWelcome).toBe(true);
  });
});
