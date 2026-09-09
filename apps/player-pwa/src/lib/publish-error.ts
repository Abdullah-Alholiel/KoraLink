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

/** Exact amounts extracted from the API's insufficient-balance 400 message.
 *  The API emits: "Insufficient wallet balance. Required: SAR 375.00, Available: SAR 120.00" */
export interface WalletShortfall {
    requiredSar: number;
    availableSar: number;
    /** required − available, rounded up to 2 d.p. (≥ 0.01 by construction). */
    shortfallSar: number;
}

/**
 * Deficit in SAR a wallet is short of a required amount, rounded UP to whole
 * halalas (min 0.01). Computed in halalas with an epsilon guard — naive
 * `(100.01 − 40.00) * 100` produces 6001.000000000001 and a bare Math.ceil
 * silently overcharges one halala.
 */
export function computeShortfall(requiredSar: number, availableSar: number): number {
    return Math.max(1, Math.ceil((requiredSar - availableSar) * 100 - 1e-6)) / 100;
}

/**
 * Parse the API's wallet-shortfall amounts out of an error message. Returns null
 * when the message isn't an insufficient-balance error or carries no parseable
 * amounts (e.g. the reschedule variant without "wallet"). Used as the race
 * fallback when the proactive pre-check passed but the server rejected the debit.
 */
export function parseWalletShortfall(message: string): WalletShortfall | null {
    if (!/insufficient wallet balance/i.test(message)) return null;
    const req = message.match(/Required:\s*SAR\s*([\d.]+)/i);
    const avail = message.match(/Available:\s*SAR\s*([\d.]+)/i);
    if (!req || !avail) return null;
    const requiredSar = parseFloat(req[1]);
    const availableSar = parseFloat(avail[1]);
    if (!Number.isFinite(requiredSar) || !Number.isFinite(availableSar)) return null;
    return {
        requiredSar,
        availableSar,
        shortfallSar: computeShortfall(requiredSar, availableSar),
    };
}

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
