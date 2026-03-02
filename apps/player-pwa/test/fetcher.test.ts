import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetcher, FetchError } from '@/lib/fetcher';

// Mock the env module
vi.mock('@/env.mjs', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'https://api.test.local',
  },
}));

describe('fetcher', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('includes credentials: include by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetcher('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('appends query params to the URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetcher('/matches', { params: { page: '2', limit: '10' } });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=10');
  });

  it('throws FetchError on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })
    );

    await expect(fetcher('/protected')).rejects.toBeInstanceOf(FetchError);
  });

  it('FetchError captures status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    try {
      await fetcher('/missing');
    } catch (err) {
      expect(err).toBeInstanceOf(FetchError);
      expect((err as FetchError).status).toBe(404);
    }
  });
});
