// ─────────────────────────────────────────────────────────────────────────────
// Publish-error classification — maps raw API/Zod errors to localized i18n keys
// shown inside the PublishWarningSheet (single contextual error surface).
//
// Since the error-message-standards cycle (2026-09-06) the generic kinds
// (network / validation) are derived from the shared classifier in
// `error-classify.ts`; only the host-publish-specific business kinds remain
// here. Public API is unchanged for all consumers.
//
// P2-373 (run #210): business kinds classify on the API's STABLE MACHINE CODE
// first (FetchError.code — `{ message, code }` exception bodies, same
// convention as ACCOUNT_BANNED). The English-copy regexes remain ONLY as a
// stale-bundle fallback for cached clients talking to the new API — any copy
// edit or locale change on the server can no longer silently break
// classification.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyError } from './error-classify';

export type PublishErrorKind =
  | 'insufficient_balance'
  | 'hosting_terms'
  | 'slot_taken'
  | 'slot_started'
  | 'network'
  | 'validation'
  | 'generic';

/** Stable API machine codes → publish kinds (P2-373). */
const PUBLISH_CODE_KINDS: Record<string, PublishErrorKind> = {
  WALLET_INSUFFICIENT: 'insufficient_balance',
  HOSTING_TERMS_REQUIRED: 'hosting_terms',
  SLOT_TAKEN: 'slot_taken',
  SLOT_STARTED: 'slot_started',
};

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

/** i18n key per error kind (full key path — the sheet resolves it at root). */
export const PUBLISH_ERROR_KEYS: Record<PublishErrorKind, string> = {
  insufficient_balance: 'host.errorInsufficientBalance',
  hosting_terms: 'host.hostingConsentRequired',
  slot_taken: 'host.errorSlotTaken',
  slot_started: 'host.errorSlotStarted',
  network: 'host.errorNetwork',
  validation: 'host.errorValidation',
  generic: 'host.createError',
};

/** Classify a publish (createMatch) failure into a localized error kind. */
export function classifyPublishError(err: unknown): PublishErrorKind {
  // P2-373: the stable machine code wins — classification no longer depends
  // on English server copy. (code rides FetchError.code from the API's
  // `{ message, code }` exception body.)
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string' && PUBLISH_CODE_KINDS[code]) {
    return PUBLISH_CODE_KINDS[code];
  }

  const message = ((err as { message?: string })?.message ?? '').toString();

  // Stale-bundle fallbacks (old API / cached client): keep the historical
  // copy matching so an in-flight deploy never mislabels a failure.
  if (/insufficient wallet balance/i.test(message)) {
    return 'insufficient_balance';
  }
  if (/hosting terms must be accepted/i.test(message)) {
    return 'hosting_terms';
  }
  if (/slot.*booked|already been booked/i.test(message)) {
    return 'slot_taken';
  }
  if (/slot has already started/i.test(message)) {
    return 'slot_started';
  }

  const kind = classifyError(err);
  if (kind === 'network') return 'network';
  if (kind === 'validation') return 'validation';
  return 'generic';
}
