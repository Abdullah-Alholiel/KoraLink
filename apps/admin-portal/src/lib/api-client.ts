import { env } from '@/env.mjs';

type FetchOptions = RequestInit & {
  params?: Record<string, string>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Secure fetch wrapper for the KoraLink Admin Portal.
 *
 * - Always sends credentials: 'include' so HttpOnly session cookies
 *   issued by the NestJS backend are forwarded on every request.
 * - Defaults to Next.js 15 no-store caching so admin data is always fresh.
 *   Pass `cache: 'force-cache'` or `next: { revalidate }` to override.
 */
export async function apiClient<T>(
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

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      `Request failed with status ${response.status}`,
      response.status,
      url.toString()
    );
  }

  return response.json() as Promise<T>;
}
