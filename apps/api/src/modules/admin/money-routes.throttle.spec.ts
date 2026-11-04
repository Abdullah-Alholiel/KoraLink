import { describe, it, expect } from '@jest/globals';
import 'reflect-metadata';
import { WalletController } from '../wallet/wallet.controller';
import { AdminSettlementsController } from './settlements.controller';

/**
 * Run #185 (Reviewer A run-#181 follow-through + P2-295): route-level
 * throttle posture for money paths. Pins the decorator metadata directly
 * (P2-241 template — same pattern as metrics.throttle.spec.ts): Throttler v6
 * stores per-route metadata under `THROTTLER:<FIELD>default`; importing the
 * controllers applies the real production decorators, so Reflect metadata
 * here observes exactly what will run.
 *
 * - Admin settlements MONEY ops (pay/generate): explicit 10/min.
 * - Wallet reads (balance/history): explicit 60/min parity with topup GETs.
 */
describe('Run #185 — money-route throttles', () => {
  const LIMIT_KEY = 'THROTTLER:LIMITdefault';
  const TTL_KEY = 'THROTTLER:TTLdefault';

  function methodOf(
    proto: Record<string, unknown>,
    name: string,
  ): (...args: never[]) => unknown {
    const fn = proto[name];
    if (typeof fn !== 'function') throw new Error(`${name} missing`);
    return fn as (...args: never[]) => unknown;
  }

  it('POST admin/settlements/:id/pay carries a route-level 10/min throttle', () => {
    const fn = methodOf(
      AdminSettlementsController.prototype as unknown as Record<string, unknown>,
      'pay',
    );
    expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBe(10);
    expect(Reflect.getMetadata(TTL_KEY, fn)).toBe(60_000);
  });

  it('POST admin/settlements/generate carries a route-level 10/min throttle', () => {
    const fn = methodOf(
      AdminSettlementsController.prototype as unknown as Record<string, unknown>,
      'generate',
    );
    expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBe(10);
    expect(Reflect.getMetadata(TTL_KEY, fn)).toBe(60_000);
  });

  it('GET wallet/balance carries an explicit 60/min throttle', () => {
    const fn = methodOf(
      WalletController.prototype as unknown as Record<string, unknown>,
      'getBalance',
    );
    expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBe(60);
    expect(Reflect.getMetadata(TTL_KEY, fn)).toBe(60_000);
  });

  it('GET wallet/history carries an explicit 60/min throttle', () => {
    const fn = methodOf(
      WalletController.prototype as unknown as Record<string, unknown>,
      'getHistory',
    );
    expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBe(60);
    expect(Reflect.getMetadata(TTL_KEY, fn)).toBe(60_000);
  });

  it('GET wallet/payout-receipt/:matchId carries an explicit 60/min throttle (PR-Agent r2 PR #211)', () => {
    const fn = methodOf(
      WalletController.prototype as unknown as Record<string, unknown>,
      'getPayoutReceipt',
    );
    expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBe(60);
    expect(Reflect.getMetadata(TTL_KEY, fn)).toBe(60_000);
  });

  it('admin settlement READS stay on the global 60/min (no route metadata)', () => {
    const proto = AdminSettlementsController.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const name of ['list', 'findOne']) {
      const fn = methodOf(proto, name);
      expect(Reflect.getMetadata(LIMIT_KEY, fn)).toBeUndefined();
      expect(Reflect.getMetadata(TTL_KEY, fn)).toBeUndefined();
    }
  });
});
