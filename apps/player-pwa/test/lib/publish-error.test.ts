import { describe, it, expect } from 'vitest';
import { classifyPublishError, PUBLISH_ERROR_KEYS } from '@/lib/publish-error';

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
