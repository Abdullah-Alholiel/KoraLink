import { ApiError } from '@/lib/api';

// P2-283: ApiError→bucket mapping for the dispute actions (settlements
// moneyActionFailure pattern); raw backend text is never rendered. Unlike
// settlements, 400 needs a discriminator (PR-Agent r1 #199): the service
// answers a state race ("already been decided", "Only decided disputes can
// be reopened") with 400 → 'conflict', while every OTHER 400 is payload
// validation (e.g. an over-long note) → 'invalid', so the admin gets
// "check your entries" instead of a refresh loop.
//
// P2-383: the stable `code` the API now attaches is checked FIRST; the prose
// regex stays only as a deploy-skew fallback for an older API without codes.
export type DisputeActionFailure = 'auth' | 'access' | 'conflict' | 'invalid' | 'server' | 'network';

const DISPUTE_STATE_CODES = new Set(['DISPUTE_ALREADY_DECIDED', 'DISPUTE_NOT_DECIDED']);

export function disputeActionFailure(err: unknown): DisputeActionFailure {
  if (!(err instanceof ApiError)) return 'network';
  const status = err.status;
  if (status === 401) return 'auth';
  if (status === 403 || status === 404) return 'access';
  if (status === 409) return 'conflict';
  if (status === 400) {
    if (err.code) return DISPUTE_STATE_CODES.has(err.code) ? 'conflict' : 'invalid';
    return /already been decided|Only decided disputes can be reopened/.test(err.message)
      ? 'conflict'
      : 'invalid';
  }
  if (status === 429 || status >= 500) return 'server';
  return 'network';
}
