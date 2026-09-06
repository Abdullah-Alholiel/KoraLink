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

describe('errorKey / ERROR_KEYS', () => {
  it('maps every kind to an errors.* key', () => {
    for (const kind of Object.keys(ERROR_KEYS) as ErrorKind[]) {
      expect(errorKey(kind)).toBe(`errors.${kind}`);
      expect(errorKey(kind)).toMatch(/^errors\./);
    }
  });
});
