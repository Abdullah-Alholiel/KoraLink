import { describe, it, expect } from 'vitest';
import { makeQueryClient } from '@/providers/QueryProvider';
import { FetchError } from '@/lib/fetcher';

/**
 * Regression tests for the app-wide retry policy (prod console noise,
 * 2026-09-09): React Query's old `retry: 1` re-fired deterministic 4xx
 * rejections — a non-member opening a match page produced 403 ×2 on
 * /matches/:id/messages, and 401 bootstrap probes doubled too. The policy
 * must retry transient failures once but NEVER retry a 4xx.
 */
describe('QueryClient retry policy', () => {
  it('never retries deterministic 4xx errors', () => {
    const client = makeQueryClient();
    const retry = client.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: Error,
    ) => boolean;

    expect(retry).toBeTypeOf('function');

    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(retry(0, new FetchError('no', status, '/x'))).toBe(false);
    }
  });

  it('still retries transient failures once (network / 5xx)', () => {
    const client = makeQueryClient();
    const retry = client.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: Error,
    ) => boolean;

    expect(retry(0, new Error('network boom'))).toBe(true);
    expect(retry(0, new FetchError('boom', 500, '/x'))).toBe(true);
    expect(retry(0, new FetchError('gateway', 502, '/x'))).toBe(true);
    // But only once
    expect(retry(1, new Error('network boom'))).toBe(false);
    expect(retry(1, new FetchError('boom', 500, '/x'))).toBe(false);
  });
});
