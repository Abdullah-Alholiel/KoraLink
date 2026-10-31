import { describe, it, expect } from 'vitest';
import { formatMoney } from '@/lib/format';

/**
 * P2-128 (run #93): money must follow the active locale — Arabic users get
 * Arabic-Indic digits + ر.س, English keeps the historical fixed "SAR 150.00"
 * shape (byte-identical to the old en-US/en-GB module-scope formatter, so
 * existing UI copy and tests don't shift). NOTE: Intl emits U+00A0 (NBSP)
 * between the currency mark and the amount on this ICU build — assertions
 * are whitespace-robust, never raw-space literals.
 */
const NBSP = /\u00a0|\s/g;
const squashed = (s: string) => s.replace(NBSP, '');

describe('formatMoney (P2-128 locale-aware money)', () => {
  it('en keeps the historical fixed currency shape (modulo Intl NBSP)', () => {
    expect(squashed(formatMoney(150, 'en'))).toBe('SAR150.00');
    expect(squashed(formatMoney(0, 'en'))).toBe('SAR0.00');
    expect(squashed(formatMoney(1234.5, 'en'))).toBe('SAR1,234.50');
  });

  it('en (arabic-locale numbers) keeps Latin digits and the SAR mark', () => {
    expect(formatMoney(150, 'en')).toMatch(/^SAR[\s\u00a0]?150\.00$/);
  });

  it('ar renders Arabic-Indic digits with the ر.س currency mark', () => {
    const ar = formatMoney(150, 'ar');
    expect(ar).not.toContain('SAR');
    expect(ar).toContain('ر.س');
    // Arabic-Indic digits ١٥٠ present; no Latin digits.
    expect(ar).toContain('١٥٠');
    expect(ar).not.toMatch(/[0-9]/);
  });

  it('rounds to 2 decimals in both locales', () => {
    expect(squashed(formatMoney(99.999, 'en'))).toBe('SAR100.00');
    expect(formatMoney(99.999, 'ar')).toContain('١٠٠');
  });
});
