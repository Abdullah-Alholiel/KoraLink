import { env } from '@/env.mjs';

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
  const url = new URL(
    path.startsWith('http') ? path : `${env.NEXT_PUBLIC_API_URL}${path}`
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
    throw new FetchError(
      `Request failed with status ${response.status}`,
      response.status,
      url.toString()
    );
  }

  return response.json() as Promise<T>;
}
