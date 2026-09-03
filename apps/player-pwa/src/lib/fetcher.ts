import { env } from '@/env.mjs';
import { addBreadcrumb } from '@/providers/ObservabilityProvider';
// Direct store access for the 401 self-heal — the store imports nothing from
// this module, so no cycle (AuthBootstrap composes both, which is fine).
import { useAppStore } from '@/store/useAppStore';

type FetchOptions = RequestInit & {
  params?: Record<string, string>;
};

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const TOKEN_KEY = 'koralink_token';
const PDPL_RESTORE_TOKEN_KEY = 'koralink_pdpl_restore_token';

/** Store the dev-login JWT so cross-origin fetches can send it as Bearer. */
export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

/** Clear the stored JWT (logout). */
export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * P0-6 (run #30): for the restore-account endpoint, fall back to the
 * PDPL restore-token Bearer when the regular session token is absent.
 * After DELETE /users/me the user is signed out (koralink_token cleared),
 * but the `koralink_pdpl_restore_token` is persisted — without this fallback
 * POST /users/me/restore goes out anonymous and the strategy 401s on
 * `deleted_at IS NOT NULL`.
 */
function getBearerForRequest(
  path: string,
  currentToken: string | null
): string | null {
  if (currentToken) return currentToken;
  if (
    typeof window !== 'undefined' &&
    (path === '/users/me/restore' || path.endsWith('/users/me/restore'))
  ) {
    return localStorage.getItem(PDPL_RESTORE_TOKEN_KEY);
  }
  return null;
}

export async function fetcher<T>(
  path: string,
  { params, ...options }: FetchOptions = {}
): Promise<T> {
  let apiBase = env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (
      (apiBase.includes('localhost:3001') || apiBase.includes('127.0.0.1:3001')) &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1'
    ) {
      apiBase = `http://${hostname}:3001/api/v1`;
    }
  }

  const url = new URL(
    path.startsWith('http') ? path : `${apiBase}${path}`
  );

  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  }

  const { headers: customHeaders, ...restOptions } = options;

  // Cross-origin dev via Tailscale: SameSite=Lax cookies are not forwarded,
  // so attach the JWT as a Bearer token when one is stored (dev-login).
  const sessionToken =
    typeof window !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;
  // P0-6 (run #30): /users/me/restore falls back to the PDPL restore-token
  // Bearer when the session token is absent (after soft-delete logout).
  const token = getBearerForRequest(path, sessionToken);

  const response = await fetch(url.toString(), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    },
    ...restOptions,
  });

  if (!response.ok) {
    // Surface the API's actual error message so callers can classify it
    // (e.g. "Insufficient wallet balance…" → specific UI). Fall back to the
    // status text when the body isn't JSON or has no message.
    let apiMessage = '';
    try {
      const body = await response.clone().json().catch(() => null);
      apiMessage =
        (body && (body.message ?? body.error))?.toString() ?? '';
      // NestJS validation errors return string[] — keep the first entry
      if (Array.isArray(body?.message)) apiMessage = body.message[0] ?? '';
    } catch {
      apiMessage = '';
    }
    // Sentry breadcrumb for API failures — gives error trails across all pages
    addBreadcrumb(
      `API ${response.status}: ${options.method ?? 'GET'} ${path}`,
      'api',
      response.status >= 500 ? 'error' : 'warning',
      { status: response.status, path, method: options.method ?? 'GET' },
    );
    // ── 401 self-heal (P2-17, run #10) ─────────────────────────────────
    // A stored Bearer (dev-login) or HttpOnly cookie can silently expire or the
    // account can be banned — until now every query just 401'd forever and the
    // user stayed trapped in an authed shell with error states everywhere.
    // Global handler: clear the stale auth state and bounce to /login (the
    // next-intl middleware resolves the locale-prefixed route). Auth endpoints
    // are excluded — login/OTP flows surface their own 401 inline (wrong code),
    // and the AuthBootstrap probe handles /users/me itself.
    //
    // P0-6 (run #30): /users/me/restore is also excluded — its 401 means the
    // PDPL restore-token has expired (past the 30-day grace window) and the
    // fetcher's restore-banner handles the error inline (no global redirect).
    if (response.status === 401 && typeof window !== 'undefined') {
      const isAuthPath = path.startsWith('/auth/');
      const isRestorePath =
        path === '/users/me/restore' || path.endsWith('/users/me/restore');
      if (!isAuthPath && !isRestorePath) {
        clearAuthToken();
        useAppStore.getState().logout();
        if (!window.location.pathname.endsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }

    throw new FetchError(
      apiMessage || `Request failed with status ${response.status}`,
      response.status,
      url.toString()
    );
  }

  // 204 No Content — return empty (e.g. DELETE /matches/:id/leave)
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}