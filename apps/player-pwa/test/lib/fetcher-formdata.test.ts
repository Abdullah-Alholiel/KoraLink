import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetcher } from '@/lib/fetcher';

/**
 * P2-50 (run #181) — fetcher FormData (multipart) support.
 *
 * The avatar upload POSTs a FormData body. The default JSON Content-Type
 * would corrupt the multipart body (no boundary), so the fetcher must OMIT
 * it and let the browser set `multipart/form-data; boundary=…`.
 */

const originalFetch = global.fetch;

describe('fetcher FormData (multipart) support', () => {
  let calls: { url: string; init: RequestInit }[] = [];

  beforeEach(() => {
    calls = [];
    localStorage.removeItem('koralink_token');
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('JSON requests keep the application/json Content-Type', async () => {
    await fetcher('/wallet/balance', { method: 'GET' });
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('FormData requests OMIT Content-Type so the browser sets the boundary', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), 'a.jpg');
    await fetcher('/users/me/avatar', { method: 'POST', body: fd });
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('Content-Type')).toBeNull();
    expect(calls[0].init.body).toBe(fd);
  });

  it('FormData requests still ride credentials:include + same-origin token gate', async () => {
    localStorage.setItem('koralink_token', 'tok-123');
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'a.jpg');
    await fetcher('/users/me/avatar', { method: 'POST', body: fd });
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer tok-123');
    expect(calls[0].init.credentials).toBe('include');
  });
});
