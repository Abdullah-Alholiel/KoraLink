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
  | 'unknown';

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
