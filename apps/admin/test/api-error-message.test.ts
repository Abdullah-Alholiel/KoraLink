import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiErrorToMessage, classifyApiError } from '@/lib/api';
import { disputeActionFailure } from '@/lib/dispute-errors';
import en from '@/messages/en.json';
import arJson from '@/messages/ar.json';

type Msgs = Record<string, Record<string, string>>;
const enM = en as unknown as Msgs;
const arM = arJson as unknown as Msgs;

/** Identity translator: returns the key so assertions can check routing. */
const t = (key: string): string => key;

const statusLike = (status: number): Error =>
  ({ status, message: 'Internal Server Error' }) as unknown as Error;

const CASES: Array<[number, string]> = [
  // P2-413: bare 400/422 = payload validation; 409 = state conflict.
  [400, 'errors.validation'],
  [409, 'errors.conflict'],
  [422, 'errors.validation'],
  [401, 'errors.auth'],
  [403, 'errors.auth'],
  [404, 'errors.notFound'],
  [429, 'errors.rate'],
  [500, 'errors.server'],
  [502, 'errors.server'],
  [503, 'errors.server'],
  [418, 'errors.generic'],
];

describe('apiErrorToMessage', () => {
  it.each(CASES)('ApiError status %i -> %s', (status, key) => {
    expect(apiErrorToMessage(new ApiError('Internal Server Error', status), t)).toBe(key);
  });

  it.each(CASES)('status-shaped object %i -> %s', (status, key) => {
    expect(apiErrorToMessage(statusLike(status), t)).toBe(key);
  });

  it('maps a network TypeError to errors.network', () => {
    expect(apiErrorToMessage(new TypeError('Failed to fetch'), t)).toBe('errors.network');
    expect(classifyApiError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyApiError(new TypeError('Load failed'))).toBe('network');
    expect(
      classifyApiError(new TypeError('NetworkError when attempting to fetch resource.')),
    ).toBe('network');
  });

  it('a client-bug TypeError is NOT network — generic bucket + diagnostics', () => {
    expect(classifyApiError(new TypeError("Cannot read properties of undefined"))).toBe('generic');
    expect(apiErrorToMessage(new TypeError("Cannot read properties of undefined"), t)).toBe(
      'errors.generic',
    );
  });

  it('maps non-Error input and status-less errors to errors.generic', () => {
    expect(apiErrorToMessage('boom', t)).toBe('errors.generic');
    expect(apiErrorToMessage(undefined, t)).toBe('errors.generic');
    expect(apiErrorToMessage(null, t)).toBe('errors.generic');
    expect(apiErrorToMessage({ status: 'nope' }, t)).toBe('errors.generic');
    expect(apiErrorToMessage(new Error('Internal Server Error'), t)).toBe('errors.generic');
  });

  it('uses fallbackKey only for the generic bucket', () => {
    expect(apiErrorToMessage(new Error('x'), t, 'slotManager.generationFailed')).toBe(
      'slotManager.generationFailed',
    );
    expect(apiErrorToMessage('x', t, 'hq.restoreFailed')).toBe('hq.restoreFailed');
    expect(apiErrorToMessage(new ApiError('x', 500), t, 'hq.restoreFailed')).toBe('errors.server');
  });

  it('never returns the raw error message text in any branch', () => {
    const raw = 'Internal Server Error';
    const realT = (key: string): string => {
      const [ns, k] = key.split('.');
      const v = enM[ns]?.[k];
      return v ?? key;
    };
    const inputs: unknown[] = [
      ...CASES.map(([s]) => new ApiError(raw, s)),
      ...CASES.map(([s]) => statusLike(s)),
      new TypeError(raw),
      new Error(raw),
      raw,
      { message: raw },
    ];
    for (const e of inputs) {
      for (const fb of [undefined, 'errors.failed']) {
        expect(apiErrorToMessage(e, t, fb)).not.toContain(raw);
        expect(apiErrorToMessage(e, realT, fb)).not.toContain(raw);
      }
    }
  });
});

describe('errors i18n namespace', () => {
  const KEYS = ['conflict', 'validation', 'auth', 'notFound', 'rate', 'server', 'network', 'offline', 'generic', 'failed'];
  it('EN and AR have identical, complete, non-empty errors key sets', () => {
    const e = enM.errors;
    const a = arM.errors;
    expect(Object.keys(e).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
    for (const k of KEYS) {
      expect(e[k].length).toBeGreaterThan(0);
      expect(a[k].length).toBeGreaterThan(0);
    }
  });

  it('every fallback key passed at call sites exists in both locales', () => {
    const fallbacks = [
      'adminReports.failed', 'hq.restoreFailed', 'venueForm.failed', 'venueTransfer.failed',
      'slotManager.generationFailed', 'slotManager.couldNotAdd', 'slotManager.deleteFailed',
      'matchEdit.failed', 'pitchForm.failed', 'errors.failed', 'common.failedToLoad',
    ];
    for (const key of fallbacks) {
      const [ns, k] = key.split('.');
      for (const m of [enM, arM]) {
        expect(typeof m[ns]?.[k]).toBe('string');
      }
    }
  });
});

// P2-383: stable machine codes ride alongside the (unchanged) prose.
describe('ApiError code (P2-383)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );

  it('carries the code from a non-ok response body, message unchanged', async () => {
    stubFetch(400, {
      message: 'This dispute has already been decided.',
      code: 'DISPUTE_ALREADY_DECIDED',
      statusCode: 400,
    });
    const err = await api.post('/admin/disputes/d1/resolve', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe('DISPUTE_ALREADY_DECIDED');
    expect((err as ApiError).message).toBe('This dispute has already been decided.');
  });

  it('code is undefined when the body has none', async () => {
    stubFetch(500, { message: 'Internal Server Error', statusCode: 500 });
    const err = await api.get('/x').catch((e: unknown) => e);
    expect((err as ApiError).code).toBeUndefined();
    expect(apiErrorToMessage(err, t)).toBe('errors.server');
  });

  it('a coded ApiError keeps the same apiErrorToMessage bucket', () => {
    expect(apiErrorToMessage(new ApiError('x', 400, 'DISPUTE_NOT_DECIDED'), t)).toBe(
      'errors.conflict',
    );
  });
});

describe('disputeActionFailure (P2-383 code-first)', () => {
  it.each(['DISPUTE_ALREADY_DECIDED', 'DISPUTE_NOT_DECIDED'])(
    '400 with code %s -> conflict, regardless of message',
    (code) => {
      expect(disputeActionFailure(new ApiError('reworded prose', 400, code))).toBe('conflict');
    },
  );

  it('400 with an unrelated code -> invalid even if old prose is present', () => {
    expect(
      disputeActionFailure(
        new ApiError('This dispute has already been decided.', 400, 'VALIDATION_FAILED'),
      ),
    ).toBe('invalid');
  });

  it('regex fallback still maps old prose when code is absent (deploy skew)', () => {
    expect(
      disputeActionFailure(new ApiError('This dispute has already been decided.', 400)),
    ).toBe('conflict');
    expect(
      disputeActionFailure(new ApiError('Only decided disputes can be reopened.', 400)),
    ).toBe('conflict');
    expect(disputeActionFailure(new ApiError('note must be shorter', 400))).toBe('invalid');
  });

  it('non-400 buckets are unchanged', () => {
    expect(disputeActionFailure(new ApiError('x', 401))).toBe('auth');
    expect(disputeActionFailure(new ApiError('x', 404))).toBe('access');
    expect(disputeActionFailure(new ApiError('x', 409))).toBe('conflict');
    expect(disputeActionFailure(new ApiError('x', 503))).toBe('server');
    expect(disputeActionFailure(new Error('x'))).toBe('network');
  });
});
