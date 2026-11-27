import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorToMessage, classifyApiError } from '@/lib/api';

/**
 * P2-413 (run #235) — classifyApiError code-first discriminator + 400/422
 * split out of the 'conflict' bucket.
 *
 * Before: 400/409/422 all mapped to 'conflict' ("someone else updated it,
 * refresh the page") — a payload-validation failure (over-long note, bad
 * email) told the admin to refresh, which loops forever. The dispute fork
 * (dispute-errors.ts) already needed a 400 discriminator, proving the shape.
 *
 * After: stable backend codes win FIRST (state-race codes → 'conflict');
 * 409 → 'conflict'; 400/422 → 'validation' ("check your entries").
 */

const t = (key: string) => key;

describe('P2-413 classifyApiError', () => {
  it('409 stays conflict', () => {
    expect(classifyApiError(new ApiError('x', 409))).toBe('conflict');
  });

  it('bare 400 and 422 are validation, not conflict', () => {
    expect(classifyApiError(new ApiError('bad payload', 400))).toBe('validation');
    expect(classifyApiError(new ApiError('unprocessable', 422))).toBe('validation');
    expect(apiErrorToMessage(new ApiError('bad payload', 400), t)).toBe('errors.validation');
  });

  it('known state-race codes beat the status heuristic (code-first)', () => {
    for (const code of ['DISPUTE_ALREADY_DECIDED', 'DISPUTE_NOT_DECIDED']) {
      expect(classifyApiError(new ApiError('msg', 400, code))).toBe('conflict');
    }
    // Unknown code → falls through to the status bucket.
    expect(classifyApiError(new ApiError('msg', 400, 'SOMETHING_ELSE'))).toBe('validation');
    // Code-first even when the status is not 4xx-conflict-shaped.
    expect(classifyApiError(new ApiError('msg', 422, 'DISPUTE_ALREADY_DECIDED'))).toBe('conflict');
  });

  it('duplicate-value codes route to validation — PR-Agent r1 #306: EMAIL_TAKEN under the state-race copy told admins to refresh, which cannot free a taken email', () => {
    expect(classifyApiError(new ApiError('msg', 409, 'EMAIL_TAKEN'))).toBe('validation');
    expect(apiErrorToMessage(new ApiError('msg', 409, 'EMAIL_TAKEN'), t)).toBe('errors.validation');
    // Unknown code on 409 keeps the state-race bucket (fail-safe for future codes).
    expect(classifyApiError(new ApiError('msg', 409, 'SOME_FUTURE_CODE'))).toBe('conflict');
  });

  it('ApiError.code carries through other statuses unchanged', () => {
    expect(classifyApiError(new ApiError('msg', 500, 'ANY_CODE'))).toBe('server');
    expect(classifyApiError(new ApiError('msg', 404, 'ANY_CODE'))).toBe('notFound');
    expect(classifyApiError(new ApiError('msg', 401, 'ANY_CODE'))).toBe('auth');
    expect(classifyApiError(new ApiError('msg', 429, 'ANY_CODE'))).toBe('rate');
    // No code + no status → network/generic classes untouched.
    expect(classifyApiError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyApiError(new Error('plain'))).toBe('generic');
  });

  it('code-first branch never fires for plain errors without a code', () => {
    expect(classifyApiError({ status: 400 })).toBe('validation');
    expect(classifyApiError({ status: 400, code: 'DISPUTE_ALREADY_DECIDED' })).toBe('validation');
  });
});
