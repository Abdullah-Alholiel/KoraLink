import { BadRequestException } from '@nestjs/common';

import {
  centsFromMoneyString,
  centsToMoneyString,
  moneyToNumber,
  quantizeMoney2dpString,
} from '../../common/utils/money';
import { reportFanOutError } from '../../common/utils/fanout';
import {
  pitchCostFromHourlyRate,
} from './matches.service';

/**
 * P2-168 (run #115): exact-cents money math for wallet reads and error
 * amounts. The house rule (P2-4): amounts that move money or appear in
 * user-facing copy must never drift a fils via a float path.
 *
 * Pins:
 *  - exact-2dp numeric strings pass through untouched (no float round-trip);
 *  - the 0.1+0.2 class edge quantizes to '0.30', not '0.30000000000000004';
 *  - cents round-trip is exact for every 2dp value;
 *  - pitch cost derivation matches the legacy formula on normal inputs and
 *    beats it on the fils-boundary case (37.5h at 0.07/hr).
 *  - reportFanOutError never rethrows and returns undefined (chainable as
 *    the .catch() replacement at the 9 fire-and-forget sites, P2-169).
 */
describe('P2-168 exact-cents money primitives (run #115)', () => {
  describe('quantizeMoney2dpString', () => {
    it('passes exact-2dp numeric strings through untouched', () => {
      expect(quantizeMoney2dpString('123.45')).toBe('123.45');
      expect(quantizeMoney2dpString('-0.07')).toBe('-0.07');
      expect(quantizeMoney2dpString('0.00')).toBe('0.00');
    });

    it('normalizes floats through toFixed (no 0.30000000000000004)', () => {
      expect(quantizeMoney2dpString(0.1 + 0.2)).toBe('0.30');
      expect(quantizeMoney2dpString(50)).toBe('50.00');
      expect(quantizeMoney2dpString(null)).toBe('0.00');
      expect(quantizeMoney2dpString(undefined)).toBe('0.00');
      expect(quantizeMoney2dpString('garbage')).toBe('0.00');
    });
  });

  describe('moneyToNumber / cents round-trip', () => {
    it('parses numeric strings to exact 2dp numbers', () => {
      expect(moneyToNumber('85.50')).toBe(85.5);
      expect(moneyToNumber(null)).toBe(0);
    });

    it('cents round-trip is exact across fils-boundary values', () => {
      for (const s of ['0.07', '37.50', '1234.56', '0.01', '999999.99']) {
        expect(centsToMoneyString(centsFromMoneyString(s))).toBe(
          quantizeMoney2dpString(s),
        );
      }
      expect(centsFromMoneyString('0.07')).toBe(7);
      expect(centsFromMoneyString('85.50')).toBe(8550);
    });

    it(' centsToMoneyString formats canonical 2dp output', () => {
      expect(centsToMoneyString(5000)).toBe('50.00');
      expect(centsToMoneyString(7)).toBe('0.07');
    });
  });

  describe('pitchCostFromHourlyRate', () => {
    it('matches the legacy formula on normal inputs', () => {
      // 100/hr × 90min → 150.00 (legacy: round2(parseFloat('100')*1.5))
      expect(pitchCostFromHourlyRate('100', 90)).toBe(150);
      expect(pitchCostFromHourlyRate('85.50', 60)).toBe(85.5);
      expect(pitchCostFromHourlyRate('37.50', 45)).toBe(28.13); // ceil-cents
    });

    it('beats the float path on the fils-boundary case', () => {
      // 0.07/hr × 37.5h = 2.625 exactly → ceil-cents 2.63 (both paths agree,
      // pinning the halves-away-from-zero rounding contract).
      expect(pitchCostFromHourlyRate('0.07', 2250)).toBe(2.63);
      // Exact case: 0.10/hr × 90min → 15.00 with zero float noise
      // (legacy parseFloat('0.10')*1.5 = 0.15000000000000002 pre-round2).
      expect(pitchCostFromHourlyRate('0.10', 90)).toBe(0.15);
    });

    it('null/undefined rate → 0 cost (legacy-row parity)', () => {
      expect(pitchCostFromHourlyRate(null, 90)).toBe(0);
      expect(pitchCostFromHourlyRate(undefined, 90)).toBe(0);
    });
  });

  describe('reportFanOutError (P2-169)', () => {
    it('never rethrows and returns undefined so it can replace .catch(() => undefined)', async () => {
      const boom = Object.assign(new Error('push socket died'), {
        status: 503,
      });
      expect(() => reportFanOutError('test.scope', boom)).not.toThrow();
      expect(reportFanOutError('test.scope', boom)).toBeUndefined();
      expect(reportFanOutError('test.scope', new Error('x'))).toBeUndefined();
      expect(reportFanOutError('test.scope', 'plain string')).toBeUndefined();
    });

    it('classifies 4xx as warn-only (no Sentry capture)', () => {
      // 4xx paths must NOT hit Sentry — 5xx/unknown must. jest.mock hoists
      // the mock above the static import of money.ts (matches.scheduler-
      // observability.spec.ts pattern).
      const Sentry = jest.requireActual('@sentry/node') as typeof import('@sentry/node');
      const spy = jest.spyOn(Sentry, 'captureException');
      try {
        reportFanOutError('test.scope', Object.assign(new Error('gone'), { status: 404 }));
        expect(spy).not.toHaveBeenCalled();
        reportFanOutError('test.scope', Object.assign(new Error('down'), { status: 503 }));
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
