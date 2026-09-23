import { describe, it, expect } from 'vitest';
import {
  classifyError,
  errorKey,
  ERROR_KEYS,
  type ErrorKind,
} from '@/lib/error-classify';
import { FetchError } from '@/lib/fetcher';

describe('classifyError', () => {
  it('classifies FetchError by HTTP status', () => {
    const cases: Array<[number, ErrorKind]> = [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'notFound'],
      [409, 'conflict'],
      [400, 'validation'],
      [422, 'validation'],
      [429, 'rateLimited'],
      [500, 'server'],
      [503, 'server'],
    ];
    for (const [status, kind] of cases) {
      expect(classifyError(new FetchError('x', status, '/test'))).toBe(kind);
    }
  });

  it('classifies network failures (status 0 or network-shaped messages)', () => {
    expect(classifyError(new FetchError('x', 0, '/test'))).toBe('network');
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyError(new Error('Network request failed'))).toBe('network');
    expect(classifyError(new Error('Load failed'))).toBe('network');
  });

  it('classifies Zod errors as validation', () => {
    const zod = Object.assign(new Error('[zod] invalid input'), {
      name: 'ZodError',
    });
    expect(classifyError(zod)).toBe('validation');
    expect(classifyError(new Error('validation failed'))).toBe('unknown'); // no status → not validation by name alone
  });

  it('maps validation-named errors to validation', () => {
    const named = Object.assign(new Error('bad'), { name: 'ValidationError' });
    expect(classifyError(named)).toBe('validation');
  });

  it('returns unknown for anything else', () => {
    expect(classifyError(new Error('weird'))).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
    expect(classifyError({ message: 'plain object' })).toBe('unknown');
  });

  it('ignores non-numeric status fields', () => {
    expect(classifyError({ status: '401' })).toBe('unknown');
    expect(classifyError({ status: 0 })).toBe('network');
  });
});

/**
 * P1-47 (run #56) — moderation error codes classify to dedicated kinds.
 *
 * The API sends `{ message, code: ACCOUNT_BANNED | ACCOUNT_SUSPENDED |
 * ACCOUNT_DELETED }` on moderation 401/403s. A blocked account must never
 * render as generic forbidden/unauthorized — the blocked screen keys off
 * these kinds, and a stable code beats the HTTP status.
 */
describe('classifyError — moderation codes (P1-47)', () => {
  it('maps FetchError code ACCOUNT_BANNED → "banned" (beats 403 status)', () => {
    const err = new FetchError('Account banned.', 403, '/auth/verify-otp', 'ACCOUNT_BANNED');
    expect(classifyError(err)).toBe('banned');
  });

  it('maps FetchError code ACCOUNT_BANNED → "banned" (beats 401 status)', () => {
    const err = new FetchError('Account banned.', 401, '/matches', 'ACCOUNT_BANNED');
    expect(classifyError(err)).toBe('banned');
  });

  it('maps FetchError code ACCOUNT_SUSPENDED → "suspended"', () => {
    const err = new FetchError('Account suspended.', 403, '/auth/send-otp', 'ACCOUNT_SUSPENDED');
    expect(classifyError(err)).toBe('suspended');
  });

  it('maps FetchError code ACCOUNT_DELETED → "deleted"', () => {
    const err = new FetchError(
      'Account scheduled for deletion.',
      403,
      '/users/me/phone',
      'ACCOUNT_DELETED',
    );
    expect(classifyError(err)).toBe('deleted');
  });

  it('an unknown code falls through to status-based classification', () => {
    const err = new FetchError('Nope.', 403, '/x', 'SOMETHING_ELSE');
    expect(classifyError(err)).toBe('forbidden');
  });

  it('no code → legacy behavior unchanged (403 → forbidden)', () => {
    const err = new FetchError('Account banned.', 403, '/x');
    expect(classifyError(err)).toBe('forbidden');
  });
});

describe('errorKey / ERROR_KEYS', () => {
  it('maps every kind to an errors.* key', () => {
    for (const kind of Object.keys(ERROR_KEYS) as ErrorKind[]) {
      expect(errorKey(kind)).toBe(`errors.${kind}`);
      expect(errorKey(kind)).toMatch(/^errors\./);
    }
  });
});
