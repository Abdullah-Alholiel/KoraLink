// ─────────────────────────────────────────────────────────────────────────────
// Error classification (error-message-standards cycle, 2026-09-06)
//
// Maps any thrown error — normally a FetchError carrying the HTTP status — to
// an ErrorKind. Flows combine the kind with their own i18n keys so users always
// see authored, localized copy (what happened / why / what to do next) and
// never raw backend strings. Pure module: no imports, trivially testable.
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'rateLimited'
  | 'server'
  | 'unknown'
  // P1-47: moderation blocks carry stable API codes (ACCOUNT_BANNED /
  // ACCOUNT_SUSPENDED / ACCOUNT_DELETED) — surfaces render localized
  // blocked states instead of the generic forbidden/unauthorized copy.
  | 'banned'
  | 'suspended'
  | 'deleted';

/** i18n key per kind (`errors` namespace). */
export const ERROR_KEYS: Record<ErrorKind, string> = {
  network: 'errors.network',
  unauthorized: 'errors.unauthorized',
  forbidden: 'errors.forbidden',
  notFound: 'errors.notFound',
  conflict: 'errors.conflict',
  validation: 'errors.validation',
  rateLimited: 'errors.rateLimited',
  server: 'errors.server',
  unknown: 'errors.unknown',
  banned: 'errors.banned',
  suspended: 'errors.suspended',
  deleted: 'errors.deleted',
};

/** API error-body codes → moderation ErrorKinds (P1-47). */
const CODE_KINDS: Record<string, ErrorKind> = {
  ACCOUNT_BANNED: 'banned',
  ACCOUNT_SUSPENDED: 'suspended',
  ACCOUNT_DELETED: 'deleted',
};

/** i18n key for a classified error. */
export function errorKey(kind: ErrorKind): string {
  return ERROR_KEYS[kind];
}

/** True when the error looks like a network-level failure (fetch/timeout). */
function isNetworkMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('timeout') ||
    m.includes('load failed') ||
    m.includes('request failed with status 0')
  );
}

/**
 * Classify any error into a user-facing ErrorKind.
 *
 * - FetchError (has numeric `status`): classified by HTTP status.
 *   `status: 0` / network-shaped messages → `network`.
 * - Everything else: Zod errors and 400-shaped DTO messages → `validation`;
 *   network-shaped messages → `network`; otherwise `unknown`.
 */
export function classifyError(err: unknown): ErrorKind {
  const name = (err as { name?: string })?.name ?? '';
  const message = ((err as { message?: string })?.message ?? '').toString();

  // Client-side Zod validation (e.g. hostMatchSchema.parse in a mutation).
  if (name === 'ZodError' || /validation/i.test(name)) return 'validation';

  // P1-47: a stable API code wins over status-based classification — a
  // suspended account must never render as generic forbidden/unauthorized.
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string' && CODE_KINDS[code]) return CODE_KINDS[code];

  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number' && status > 0) {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notFound';
    if (status === 409) return 'conflict';
    if (status === 400 || status === 422) return 'validation';
    if (status === 429) return 'rateLimited';
    if (status >= 500) return 'server';
    return 'unknown';
  }

  if (isNetworkMessage(message) || status === 0) return 'network';
  if (/\[zod/i.test(message)) return 'validation';
  return 'unknown';
}
