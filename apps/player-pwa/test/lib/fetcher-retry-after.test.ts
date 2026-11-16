import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetcher, FetchError } from '@/lib/fetcher';

// env + observability are side-effect modules — stub them out.
vi.mock('@/env.mjs', () => ({
  env: { NEXT_PUBLIC_API_URL: 'https://api.test.local' },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({ logout: vi.fn() }),
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

// P2-194 (run #129): rate-limit errors carry the server's retryAfter seconds so
// the verify page can show an honest "try again in Ns" countdown.
describe('fetcher hoists retryAfter from 429 bodies (P2-194)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('numeric retryAfter lands on the FetchError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(429, {
          statusCode: 429,
          message: 'Please wait before requesting another code.',
          retryAfter: 37,
        }),
      ),
    );

    const err = (await fetcher('/auth/send-otp').catch((e) => e)) as FetchError;
    expect(err).toBeInstanceOf(FetchError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(37);
  });

  it('string retryAfter is coerced and ceiled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(429, { retryAfter: '12.4' }),
      ),
    );

    const err = (await fetcher('/auth/send-otp').catch((e) => e)) as FetchError;
    expect(err.retryAfter).toBe(13);
  });

  it('stays undefined when the body omits it (e.g. route-throttle 429)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(429, { statusCode: 429, message: 'Throttled' }),
      ),
    );

    const err = (await fetcher('/auth/send-otp').catch((e) => e)) as FetchError;
    expect(err).toBeInstanceOf(FetchError);
    expect(err.retryAfter).toBeUndefined();
  });

  it('ignores bogus values (negative, non-numeric)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(429, { retryAfter: -5 })),
    );
    const err = (await fetcher('/auth/send-otp').catch((e) => e)) as FetchError;
    expect(err.retryAfter).toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(429, { retryAfter: 'soon' })),
    );
    const err2 = (await fetcher('/auth/send-otp').catch((e) => e)) as FetchError;
    expect(err2.retryAfter).toBeUndefined();
  });
});
