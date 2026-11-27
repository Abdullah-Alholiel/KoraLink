import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, classifyApiError, apiErrorToMessage } from '@/lib/api';
import { disputeActionFailure } from '@/lib/dispute-errors';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';

/**
 * P2-412 — admin offline gating contract:
 *
 * 1. CHOKE-POINT: apiFetch rejects WRITE submits (POST/PATCH/PUT/DELETE) with
 *    ApiError(status 0, code 'OFFLINE') BEFORE fetch when navigator.onLine is
 *    false. GET is never gated (cached-browsing stays possible).
 * 2. CLASSIFY: code 'OFFLINE' → the new 'offline' bucket; bare status 0 (no
 *    code) fail-safes to 'network'; the existing TypeError network path is
 *    unchanged.
 * 3. COPY: errors.offline exists EN+AR; the errors namespace stays in parity.
 * 4. FORK COMPAT: disputeActionFailure maps the offline guard to its
 *    'network' bucket (its union has no 'offline'; the fork is scheduled for
 *    retirement with P2-283 completion).
 */

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const onlineSpy = () => vi.spyOn(window.navigator, 'onLine', 'get');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P2-412 offline gate (apiFetch choke-point)', () => {
  it('write submit offline: throws ApiError(status 0, code OFFLINE) and never calls fetch', async () => {
    onlineSpy().mockReturnValue(false);
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockRejectedValue(new Error('fetch MUST NOT be called while offline'));
    await expect(api.post('/admin/settlements/x/pay')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'OFFLINE',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('every mutating verb is gated (patch/put/delete)', async () => {
    onlineSpy().mockReturnValue(false);
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('fetch MUST NOT be called'));
    await expect(api.patch('/x', {})).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(api.put('/x', {})).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(api.delete('/x')).rejects.toMatchObject({ code: 'OFFLINE' });
  });

  it('GET is NOT gated: passes through to fetch even while offline', async () => {
    onlineSpy().mockReturnValue(false);
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(okJsonResponse({ ok: true }));
    await expect(api.get('/admin/users')).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('online write passes through to fetch', async () => {
    onlineSpy().mockReturnValue(true);
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(okJsonResponse({ ok: true }));
    await expect(api.post('/admin/settlements/x/pay')).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('P2-412 classifyApiError offline bucket', () => {
  it("code 'OFFLINE' → 'offline'", () => {
    expect(classifyApiError(new ApiError('You are offline.', 0, 'OFFLINE'))).toBe('offline');
  });

  it('bare status 0 (no code) fail-safes to network', () => {
    expect(classifyApiError(new ApiError('no response', 0))).toBe('network');
  });

  it('TypeError failed-to-fetch still classifies as network (regression pin)', () => {
    expect(classifyApiError(new TypeError('Failed to fetch'))).toBe('network');
  });

  it('status ladder unchanged (409 conflict pin)', () => {
    expect(classifyApiError(new ApiError('conflict', 409))).toBe('conflict');
  });
});

describe('P2-412 localized copy + parity', () => {
  it('apiErrorToMessage resolves errors.offline in EN and AR', () => {
    const offlineErr = new ApiError('You are offline.', 0, 'OFFLINE');
    const lookup = (dict: Record<string, unknown>) => (key: string) =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict) as string;
    expect(apiErrorToMessage(offlineErr, lookup(enMessages))).toBe(enMessages.errors.offline);
    expect(apiErrorToMessage(offlineErr, lookup(arMessages))).toBe(arMessages.errors.offline);
  });

  it('errors ns stays in EN/AR parity (same key sets)', () => {
    expect(Object.keys(enMessages.errors).sort()).toEqual(Object.keys(arMessages.errors).sort());
  });
});

describe('P2-412 dispute fork compatibility', () => {
  it("disputeActionFailure maps the offline guard to its 'network' bucket", () => {
    expect(disputeActionFailure(new ApiError('You are offline.', 0, 'OFFLINE'))).toBe('network');
  });

  it('non-ApiError still maps to network (unchanged)', () => {
    expect(disputeActionFailure(new TypeError('Failed to fetch'))).toBe('network');
  });
});
