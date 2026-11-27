import { ApiError, classifyApiError } from '@/lib/api';

// P2-283: ApiError→bucket mapping for the dispute actions (settlements
// moneyActionFailure pattern); raw backend text is never rendered. Unlike
// settlements, 400 needs a discriminator (PR-Agent r1 #199): the service
// answers a state race ("already been decided", "Only decided disputes can
// be reopened") with 400 → 'conflict', while every OTHER 400 is payload
// validation (e.g. an over-long note) → 'invalid', so the admin gets
// "check your entries" instead of a refresh loop.
//
// P2-383: the stable `code` the API attaches is checked; the prose regex
// stays only as a deploy-skew fallback for an older API without codes.
//
// P2-413 (run #235): the stable-code check now DEFERS to classifyApiError's
// shared CONFLICT_CODES set — single source of "which codes mean state-race"
// truth, so this fork and the shared classifier can never drift. Retire this
// fork entirely once EVERY admin-relevant 400 carries a stable code (P2-283
// completion) — until then it keeps the 400-default-invalid posture that
// classifyApiError deliberately does not take (a bare 400 from an endpoint
// without codes is far more often payload validation than a state race).

export type DisputeActionFailure = 'auth' | 'access' | 'conflict' | 'invalid' | 'server' | 'network';

export function disputeActionFailure(err: unknown): DisputeActionFailure {
  if (!(err instanceof ApiError)) return 'network';
  const status = err.status;
  if (status === 401) return 'auth';
  if (status === 403 || status === 404) return 'access';
  if (status === 409) return 'conflict';
  if (status === 400) {
    // P2-413: classifyApiError owns the code→conflict decision; 'validation'
    // (its 400 fallback) maps to this fork's 'invalid' bucket.
    if (err.code) return classifyApiError(err) === 'conflict' ? 'conflict' : 'invalid';
    return /already been decided|Only decided disputes can be reopened/.test(err.message)
      ? 'conflict'
      : 'invalid';
  }
  if (status === 429 || status >= 500) return 'server';
  return 'network';
}
