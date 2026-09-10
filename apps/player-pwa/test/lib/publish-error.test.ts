import { describe, it, expect } from 'vitest';
import { classifyPublishError, PUBLISH_ERROR_KEYS, parseWalletShortfall } from '@/lib/publish-error';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';

describe('classifyPublishError', () => {
  it('classifies insufficient wallet balance', () => {
    const err = new Error(
      'Insufficient wallet balance. Required: SAR 200.00, Available: SAR 100.00',
    );
    expect(classifyPublishError(err)).toBe('insufficient_balance');
    expect(PUBLISH_ERROR_KEYS.insufficient_balance).toBe('host.errorInsufficientBalance');
  });

  it('classifies a slot conflict', () => {
    expect(classifyPublishError(new Error('This slot has already been booked by another host'))).toBe('slot_taken');
    expect(classifyPublishError(new Error('Conflict: slot booked'))).toBe('slot_taken');
  });

  it('classifies the hosting-terms consent rejection (stale bundle/session path)', () => {
    const err = new Error('Hosting terms must be accepted before booking.');
    expect(classifyPublishError(err)).toBe('hosting_terms');
    expect(PUBLISH_ERROR_KEYS.hosting_terms).toBe('host.hostingConsentRequired');
    // The key must exist in BOTH locales (the sheet resolves it via t(errorKey)).
    expect((enMessages as { host: Record<string, string> }).host.hostingConsentRequired).toBeTruthy();
    expect((arMessages as { host: Record<string, string> }).host.hostingConsentRequired).toBeTruthy();
  });

  it('classifies network failures', () => {
    expect(classifyPublishError(new Error('Failed to fetch'))).toBe('network');
    expect(classifyPublishError(new TypeError('Load failed'))).toBe('network');
  });

  it('classifies Zod validation errors', () => {
    const zodLike = Object.assign(new Error('Validation failed'), { name: 'ZodError' });
    expect(classifyPublishError(zodLike)).toBe('validation');
  });

  it('falls back to generic with a valid key', () => {
    expect(classifyPublishError(new Error('Something else'))).toBe('generic');
    expect(PUBLISH_ERROR_KEYS.generic).toBe('host.createError');
  });

  it('every kind maps to a distinct i18n key', () => {
    const keys = Object.values(PUBLISH_ERROR_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseWalletShortfall', () => {
  it('extracts Required/Available and computes the deficit from the API message', () => {
    const parsed = parseWalletShortfall(
      'API 400: POST /matches — Insufficient wallet balance. Required: SAR 375.00, Available: SAR 120.00',
    );
    expect(parsed).toEqual({ requiredSar: 375, availableSar: 120, shortfallSar: 255 });
  });

  it('rounds the deficit up to whole halalas', () => {
    const parsed = parseWalletShortfall(
      'Insufficient wallet balance. Required: SAR 100.01, Available: SAR 40.00',
    );
    expect(parsed?.shortfallSar).toBe(60.01);
  });

  it('returns null for other errors and for balance errors without amounts', () => {
    expect(parseWalletShortfall('This slot has already been booked by another host')).toBeNull();
    expect(parseWalletShortfall('Insufficient wallet balance.')).toBeNull();
    expect(parseWalletShortfall('')).toBeNull();
  });
});
