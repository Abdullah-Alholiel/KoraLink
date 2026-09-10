import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison for fixed-length secrets (OTP codes).
 *
 * A plain `stored !== provided` leaks, via early-exit timing, how many leading
 * characters of the secret a guessed prefix got right. Marginal for a 6-digit
 * code behind rate limits, but the fix is one call — OTP compares go through
 * here (phone + email flows).
 *
 * Length mismatches cannot be compared by timingSafeEqual; we burn a same-
 * length dummy comparison first so a wrong-length guess takes the same time
 * shape as a wrong-value guess, then reject.
 */
export function otpMatches(
  stored: string | undefined | null,
  provided: string,
): boolean {
  if (!stored) return false;
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
