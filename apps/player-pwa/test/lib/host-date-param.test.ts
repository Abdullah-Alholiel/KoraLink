import { describe, it, expect } from 'vitest';
import { parseHostDateParam } from '@/lib/api-adapter';

describe('parseHostDateParam', () => {
  it('accepts a valid future date', () => {
    expect(parseHostDateParam('2026-09-01', '2026-08-16')).toBe('2026-09-01');
  });

  it('accepts today (boundary)', () => {
    expect(parseHostDateParam('2026-08-16', '2026-08-16')).toBe('2026-08-16');
  });

  it('rejects a past date', () => {
    expect(parseHostDateParam('2026-08-15', '2026-08-16')).toBeNull();
  });

  it('rejects garbage formats', () => {
    expect(parseHostDateParam('not-a-date', '2026-08-16')).toBeNull();
    expect(parseHostDateParam('2026/08/16', '2026-08-16')).toBeNull();
    expect(parseHostDateParam('16-08-2026', '2026-08-16')).toBeNull();
    expect(parseHostDateParam('', '2026-08-16')).toBeNull();
    expect(parseHostDateParam(null, '2026-08-16')).toBeNull();
    expect(parseHostDateParam(undefined, '2026-08-16')).toBeNull();
  });
});
