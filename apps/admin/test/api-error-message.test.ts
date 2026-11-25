import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorToMessage, classifyApiError } from '@/lib/api';
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
  [400, 'errors.conflict'],
  [409, 'errors.conflict'],
  [422, 'errors.conflict'],
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
  const KEYS = ['conflict', 'auth', 'notFound', 'rate', 'server', 'network', 'generic', 'failed'];
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
