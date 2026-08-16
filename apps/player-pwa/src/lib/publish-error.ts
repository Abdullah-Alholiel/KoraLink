// ─────────────────────────────────────────────────────────────────────────────
// Publish-error classification — maps raw API/Zod errors to localized i18n keys
// shown inside the PublishWarningSheet (single contextual error surface).
// ─────────────────────────────────────────────────────────────────────────────

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

/** True when the error looks like a network-level failure (fetch/timeout). */
function isNetworkError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('timeout') ||
    m.includes('load failed')
  );
}

/** Classify a publish (createMatch) failure into a localized error kind. */
export function classifyPublishError(err: unknown): PublishErrorKind {
  const name = (err as { name?: string })?.name ?? '';
  const message = ((err as { message?: string })?.message ?? '').toString();

  // Zod validation from hostMatchSchema.parse in the mutation
  if (name === 'ZodError' || /validation/.test(name) || /\[zod/i.test(message)) {
    return 'validation';
  }
  if (/insufficient wallet balance/i.test(message)) {
    return 'insufficient_balance';
  }
  if (/slot.*booked|already been booked/i.test(message)) {
    return 'slot_taken';
  }
  if (isNetworkError(err instanceof Error ? err : new Error(message))) {
    return 'network';
  }
  return 'generic';
}
