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

  // ── Additional error handling & edge case tests ──

  it('FetchError has correct name property', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    try {
      await fetcher('/error');
    } catch (err) {
      expect((err as FetchError).name).toBe('FetchError');
    }
  });

  it('FetchError captures the full URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 })
    );

    try {
      await fetcher('/forbidden');
    } catch (err) {
      expect((err as FetchError).url).toContain('/forbidden');
    }
  });

  it('FetchError message includes status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502 })
    );

    try {
      await fetcher('/bad-gateway');
    } catch (err) {
      expect((err as FetchError).message).toContain('502');
    }
  });

  it('throws FetchError for 422 Unprocessable Entity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422 })
    );

    await expect(fetcher('/validate')).rejects.toThrow();
  });

  it('returns parsed JSON for successful response', async () => {
    const data = { id: 'm1', title: 'Friday Kickoff' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      })
    );

    const result = await fetcher('/matches');
    expect(result).toEqual(data);
  });

  it('works with fully qualified URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    await fetcher('https://external-api.example.com/data');
    const calledUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(calledUrl).toContain('https://external-api.example.com');
  });

  it('passes custom headers alongside defaults', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );

    await fetcher('/matches', {
      headers: { 'X-Custom': 'value' },
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      })
    );
  });

  it('handles params with empty values gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve([]),
        })
      );
  });

  // ── P0-6 (run #30): restore-token Bearer fallback ─────────────────────
  // After soft-delete the regular session token is cleared, but the
  // PDPL restore-token persists. The fetcher must use the restore-token
  // as Bearer for /users/me/restore so the user can recover their
  // account from /login.
  it('falls back to koralink_pdpl_restore_token for /users/me/restore when session token is absent', async () => {
    localStorage.setItem('koralink_pdpl_restore_token', 'restore-jwt-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', phone: '+966500000001' }),
      })
    );
    await fetcher('/users/me/restore', { method: 'POST' });
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect((options?.headers as Record<string, string>)?.Authorization).toBe(
      'Bearer restore-jwt-abc'
    );
    localStorage.removeItem('koralink_pdpl_restore_token');
  });

  it('prefers koralink_token over koralink_pdpl_restore_token when both are present', async () => {
    localStorage.setItem('koralink_token', 'session-jwt-xyz');
    localStorage.setItem('koralink_pdpl_restore_token', 'restore-jwt-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
    await fetcher('/users/me/restore', { method: 'POST' });
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect((options?.headers as Record<string, string>)?.Authorization).toBe(
      'Bearer session-jwt-xyz'
    );
    localStorage.removeItem('koralink_token');
    localStorage.removeItem('koralink_pdpl_restore_token');
  });

  it('does NOT use the restore-token for unrelated routes', async () => {
    localStorage.setItem('koralink_pdpl_restore_token', 'restore-jwt-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );
    await fetcher('/users/me/matches');
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect((options?.headers as Record<string, string>)?.Authorization).toBeUndefined();
    localStorage.removeItem('koralink_pdpl_restore_token');
  });

  it('a 401 on /users/me/restore does NOT trigger global logout + redirect', async () => {
    localStorage.setItem('koralink_token', 'session-jwt-xyz');
    localStorage.setItem('koralink_pdpl_restore_token', 'restore-jwt-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Restore window expired.' }),
        clone() {
          return this;
        },
      })
    );
    const initialLocation = window.location.href;
    await expect(
      fetcher('/users/me/restore', { method: 'POST' })
    ).rejects.toThrow('Restore window expired.');
    // koralink_token must NOT be cleared on a 401 from /users/me/restore.
    expect(localStorage.getItem('koralink_token')).toBe('session-jwt-xyz');
    // window.location.href must NOT have changed.
    expect(window.location.href).toBe(initialLocation);
    localStorage.removeItem('koralink_token');
    localStorage.removeItem('koralink_pdpl_restore_token');
  });

  it('rejects with FetchError for network failure (fetch throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(fetcher('/offline')).rejects.toThrow('Failed to fetch');
  });
});
