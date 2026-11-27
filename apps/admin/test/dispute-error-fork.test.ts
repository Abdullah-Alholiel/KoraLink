import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { disputeActionFailure } from '@/lib/dispute-errors';

/**
 * P2-413 (run #235) — the dispute fork now defers its stable-code decision to
 * classifyApiError's shared CONFLICT_CODES set (single source of truth); the
 * deploy-skew prose fallback and the 400-default-invalid posture stay.
 */

describe('P2-413 disputeActionFailure defers codes to classifyApiError', () => {
  it('known conflict code on 400 → conflict (via the shared set)', () => {
    expect(disputeActionFailure(new ApiError('x', 400, 'DISPUTE_ALREADY_DECIDED'))).toBe('conflict');
    expect(disputeActionFailure(new ApiError('x', 400, 'DISPUTE_NOT_DECIDED'))).toBe('conflict');
  });

  it('unknown/absent code on 400 → invalid (fork keeps the 400-default-invalid posture)', () => {
    expect(disputeActionFailure(new ApiError('x', 400, 'SOMETHING_ELSE'))).toBe('invalid');
    expect(disputeActionFailure(new ApiError('x', 400))).toBe('invalid');
  });

  it('deploy-skew prose fallback intact for code-less errors', () => {
    expect(disputeActionFailure(new ApiError('This dispute has already been decided', 400))).toBe('conflict');
    expect(disputeActionFailure(new ApiError('note too long', 400))).toBe('invalid');
  });

  it('non-400 mappings unchanged', () => {
    expect(disputeActionFailure(new ApiError('x', 401))).toBe('auth');
    expect(disputeActionFailure(new ApiError('x', 403))).toBe('access');
    expect(disputeActionFailure(new ApiError('x', 404))).toBe('access');
    expect(disputeActionFailure(new ApiError('x', 409))).toBe('conflict');
    expect(disputeActionFailure(new ApiError('x', 500))).toBe('server');
    expect(disputeActionFailure(new ApiError('x', 429))).toBe('server');
    expect(disputeActionFailure(new TypeError('Failed to fetch'))).toBe('network');
  });
});
