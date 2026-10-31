import { describe, it, expect } from 'vitest';
import { TOPUP_QUICK_AMOUNTS, presetsWithinBounds, validateTopupAmount } from '@/lib/topup-amount';

/**
 * P2-289 (run #180) — shared top-up amount domain tripwire.
 *
 * Pins the run-#180 contract-drift fix: bounds come from the SERVER config
 * (min 5), never a hardcoded client minimum (the legacy sheet's old `< 10`
 * check rejected legal SAR 5–9.99 top-ups the API accepts).
 */

describe('TOPUP_QUICK_AMOUNTS', () => {
    it('are all integers within the API bounds [MIN_TOPUP_SAR=5, MAX_TOPUP_SAR=2000]', () => {
        expect(TOPUP_QUICK_AMOUNTS.length).toBe(4);
        for (const qa of TOPUP_QUICK_AMOUNTS) {
            expect(qa).toBeGreaterThanOrEqual(5);
            expect(qa).toBeLessThanOrEqual(2000);
            expect(Number.isInteger(qa)).toBe(true);
        }
    });

    it('is ascending and starts at 25', () => {
        expect(TOPUP_QUICK_AMOUNTS).toEqual([25, 50, 100, 200]);
    });

    it('presetsWithinBounds drops chips outside config bounds (PR-Agent r2)', () => {
        expect(presetsWithinBounds(5, 2000)).toEqual([25, 50, 100, 200]);
        expect(presetsWithinBounds(30, 2000)).toEqual([50, 100, 200]);
        expect(presetsWithinBounds(5, 150)).toEqual([25, 50, 100]);
        expect(presetsWithinBounds(300, 2000)).toEqual([]);
    });
});

describe('validateTopupAmount', () => {
    it.each([
        ['25', 5, 2000, 'ok'],
        ['5', 5, 2000, 'ok'], // the API-min case the old hardcoded <10 check rejected
        ['2000', 5, 2000, 'ok'],
        ['49.50', 5, 2000, 'ok'],
        ['', 5, 2000, 'empty'],
        ['   ', 5, 2000, 'empty'],
        ['abc', 5, 2000, 'invalid'],
        ['12.5.3', 5, 2000, 'invalid'],
        ['-5', 5, 2000, 'invalid'],
        ['0', 5, 2000, 'invalid'],
        ['4.99', 5, 2000, 'belowMin'],
        ['7', 10, 2000, 'belowMin'], // min is config-driven, not hardcoded 10
        ['2000.01', 5, 2000, 'aboveMax'],
        ['3000', 5, 500, 'aboveMax'], // max is config-driven
    ])('validateTopupAmount(%j, %i, %i) → %s', (raw, min, max, expected) => {
        expect(validateTopupAmount(raw, min, max)).toBe(expected);
    });
});
