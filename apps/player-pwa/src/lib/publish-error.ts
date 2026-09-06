// ─────────────────────────────────────────────────────────────────────────────
// Publish-error classification — maps raw API/Zod errors to localized i18n keys
// shown inside the PublishWarningSheet (single contextual error surface).
//
// Since the error-message-standards cycle (2026-09-06) the generic kinds
// (network / validation) are derived from the shared classifier in
// `error-classify.ts`; only the host-publish-specific business kinds remain
// here. Public API is unchanged for all consumers.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyError } from './error-classify';

export type PublishErrorKind =
  | 'insufficient_balance'
  | 'slot_taken'
  | 'network'
  | 'validation'
  | 'generic';

/** i18n key per error kind (host.* namespace). */
export const PUBLISH_ERROR_KEYS: Record<PublishErrorKind, string> = {
  insufficient_balance: 'host.errorInsufficientBalance',
  slot_taken: 'host.errorSlotTaken',
  network: 'host.errorNetwork',
  validation: 'host.errorValidation',
  generic: 'host.createError',
};

/** Classify a publish (createMatch) failure into a localized error kind. */
export function classifyPublishError(err: unknown): PublishErrorKind {
  const message = ((err as { message?: string })?.message ?? '').toString();

  // Business-specific checks FIRST — a 409 carrying "insufficient wallet
  // balance" must map to the balance copy, not generic conflict copy.
  if (/insufficient wallet balance/i.test(message)) {
    return 'insufficient_balance';
  }
  if (/slot.*booked|already been booked/i.test(message)) {
    return 'slot_taken';
  }

  const kind = classifyError(err);
  if (kind === 'network') return 'network';
  if (kind === 'validation') return 'validation';
  return 'generic';
}
