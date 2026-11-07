import { describe, it, expect } from 'vitest';
import { formatMoney, formatAmount } from '@/lib/format';

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

describe('formatAmount (P2-257b i18n-interpolation amounts)', () => {
  it('en: numerals-only 2-decimal string — no currency mark (messages carry their own)', () => {
    expect(formatAmount(150, 'en')).toBe('150.00');
    expect(formatAmount(255, 'en')).toBe('255.00');
    expect(formatAmount(0, 'en')).toBe('0.00');
    expect(formatAmount(99.999, 'en')).toBe('100.00');
  });

  it('ar: Arabic-Indic digits, arabic decimal separator, NO Latin digits', () => {
    const ar = formatAmount(255, 'ar');
    expect(ar).toContain('٢٥٥');
    expect(ar).not.toMatch(/[0-9]/);
    expect(formatAmount(150, 'ar')).toContain('١٥٠');
    expect(formatAmount(99.999, 'ar')).toContain('١٠٠');
  });

  it('never emits a currency mark — t() messages provide SAR/ر.س themselves', () => {
    expect(formatAmount(150, 'en')).not.toContain('SAR');
    expect(formatAmount(150, 'ar')).not.toContain('ر.س');
  });
});

describe('formatMoney currency param (P2-257b/P2-239 — match denomination)', () => {
  it('en: non-SAR currency keeps the fixed en-GB shape (AED 30.00)', () => {
    expect(squashed(formatMoney(30, 'en', 'AED'))).toBe('AED30.00');
  });

  it('ar: non-SAR currency localizes symbol AND digits (٣٠٫٠٠ د.إ.)', () => {
    const ar = formatMoney(30, 'ar', 'AED');
    expect(ar).toContain('د.إ');
    expect(ar).toContain('٣٠');
    expect(ar).not.toMatch(/[0-9]/);
  });

  it('default param stays SAR — every existing caller is unchanged', () => {
    expect(squashed(formatMoney(150, 'en'))).toBe('SAR150.00');
  });
});
