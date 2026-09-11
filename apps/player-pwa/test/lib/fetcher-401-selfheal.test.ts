import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetcher, FetchError } from '@/lib/fetcher';

// env + observability are side-effect modules — stub them out.
vi.mock('@/env.mjs', () => ({
  env: { NEXT_PUBLIC_API_URL: 'https://api.test.local' },
}));

const logoutSpy = vi.fn();
vi.mock('@/store/useAppStore', () => ({
  // The fetcher only touches useAppStore.getState() for the 401 self-heal.
  useAppStore: {
    getState: () => ({ logout: logoutSpy }),
  },
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  addBreadcrumb: vi.fn(),
}));

function mockResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone: () => ({ json: () => Promise.resolve(body ?? {}) }),
    json: () => Promise.resolve(body ?? {}),
  };
}

describe('fetcher 401 self-heal (P2-17)', () => {
  beforeEach(() => {
    logoutSpy.mockClear();
    localStorage.clear();
    localStorage.setItem('koralink_token', 'stale-jwt');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the stored token and logs the store out on 401 (non-auth path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'Unauthorized' })),
    );

    await expect(fetcher('/wallet/balance')).rejects.toBeInstanceOf(FetchError);

    expect(localStorage.getItem('koralink_token')).toBeNull();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('still throws FetchError with the API message after the self-heal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'session expired' })),
    );

    await expect(fetcher('/users/me/matches')).rejects.toThrow('session expired');
  });

  it('does NOT log out on 401 from auth endpoints (inline inline-error UX)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'wrong code' })),
    );

    await expect(fetcher('/auth/verify-otp')).rejects.toBeInstanceOf(FetchError);

    // Wrong-OTP 401 must not nuke the session state / trigger a redirect.
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('koralink_token')).toBe('stale-jwt');
  });

  it('does NOT log out on non-401 errors (500 keeps the shell intact)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(500, { message: 'boom' })),
    );

    await expect(fetcher('/matches')).rejects.toBeInstanceOf(FetchError);

    expect(logoutSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('koralink_token')).toBe('stale-jwt');
  });

  it('401 bounce keeps the CURRENT URL locale (no middleware re-detect)', async () => {
    // Language-toggle incident 2026-09-11: a bare '/login' let the middleware
    // locale-detect the stale NEXT_LOCALE cookie and snap an /en user back to ar.
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy, pathname: '/en/wallet' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'Unauthorized' })),
    );

    await expect(fetcher('/wallet/balance')).rejects.toBeInstanceOf(FetchError);
    expect(assignSpy).toHaveBeenCalledWith('/en/login');
  });

  it('401 on the VERIFY page does NOT redirect (user stays in OTP flow)', async () => {
    // 2026-09-11 report: tapping Continue with email landed on /verify, the
    // background /users/me probe 401'd, and the self-heal flung the user
    // back to phone login — mid-flow. Auth-flow surfaces must never bounce.
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy, pathname: '/en/verify' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'Unauthorized' })),
    );

    await expect(fetcher('/users/me')).rejects.toBeInstanceOf(FetchError);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('401 on complete-profile does NOT redirect (same auth-flow rule)', async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy, pathname: '/ar/complete-profile' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(401, { message: 'Unauthorized' })),
    );

    await expect(fetcher('/wallet/balance')).rejects.toBeInstanceOf(FetchError);
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
