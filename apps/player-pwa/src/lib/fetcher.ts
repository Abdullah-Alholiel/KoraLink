import { env } from '@/env.mjs';
import { addBreadcrumb } from '@/providers/ObservabilityProvider';

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
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;

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
