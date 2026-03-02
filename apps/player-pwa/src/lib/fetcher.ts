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

  const response = await fetch(url.toString(), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
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
