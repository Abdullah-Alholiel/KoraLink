import { env } from '@/env.mjs';

type FetchOptions = RequestInit & {
  params?: Record<string, string>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
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
 * - On non-OK responses, parses the NestJS error body (JSON) if available
 *   and throws an ApiError with status, statusText, and server message.
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
    // Try to parse NestJS JSON error body first; fall back to plain text.
    const contentType = response.headers.get('content-type') ?? '';
    let errorMessage = `Request failed with status ${response.status}`;
    if (contentType.includes('application/json')) {
      const errorBody = await response.json().catch(() => ({})) as {
        message?: string;
      };
      if (errorBody.message) errorMessage = errorBody.message;
    } else {
      const text = await response.text().catch(() => '');
      if (text) errorMessage = text;
    }
    throw new ApiError(
      errorMessage,
      response.status,
      response.statusText,
      url.toString()
    );
  }

  return response.json() as Promise<T>;
}
