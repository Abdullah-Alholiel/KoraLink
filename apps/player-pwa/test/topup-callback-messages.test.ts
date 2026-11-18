import { describe, it, expect } from 'vitest';
import { topupCallbackMessageKey } from '../src/lib/topup-callback-messages';

/**
 * P2-379 (run #214) — classification now prefers the stable body `code`
 * field (FetchError.code, PR #262 body shape) with the legacy message-prefix
 * match kept ONLY as a deploy-skew fallback. Money-truth copy depends on
 * this: charged-but-declined must never render "no money was taken".
 */
describe('topupCallbackMessageKey — code-first (P2-379)', () => {
  it.each([
    ['amount_mismatch', 'wallet.topup.callbackChargedDeclined'],
    ['currency_mismatch', 'wallet.topup.callbackChargedDeclined'],
    ['payment_intent_mismatch', 'wallet.topup.notPaid'],
    ['payment_not_paid', 'wallet.topup.notPaid'],
    ['topup_already_credited', 'wallet.topup.notPaid'],
  ])('classifies code=%s → %s', (code, expected) => {
    const err = Object.assign(new Error('untranslated backend text'), { code });
    expect(topupCallbackMessageKey(err)).toBe(expected);
  });

  it('prefers code over a foreign message (copy edits cannot break classification)', () => {
    const err = Object.assign(new Error('totally reworded message'), { code: 'amount_mismatch' });
    expect(topupCallbackMessageKey(err)).toBe('wallet.topup.callbackChargedDeclined');
  });

  it('falls back to the message prefix when code is absent (deploy-skew: old API, new bundle)', () => {
    expect(topupCallbackMessageKey(new Error('amount_mismatch: payment 1 != intent 2'))).toBe(
      'wallet.topup.callbackChargedDeclined',
    );
    expect(topupCallbackMessageKey(new Error('payment_not_paid: not completed'))).toBe(
      'wallet.topup.notPaid',
    );
  });

  it('unknown code + unknown message → generic retry (charge state unconfirmed)', () => {
    const err = Object.assign(new Error('gateway hiccup'), { code: 'something_new' });
    expect(topupCallbackMessageKey(err)).toBe('wallet.topup.callbackRetry');
    expect(topupCallbackMessageKey(new Error('network down'))).toBe('wallet.topup.callbackRetry');
    expect(topupCallbackMessageKey(undefined)).toBe('wallet.topup.callbackRetry');
  });

  it('never mis-classifies a non-charged code as charged', () => {
    const err = Object.assign(new Error('payment_not_paid: x'), { code: 'payment_not_paid' });
    expect(topupCallbackMessageKey(err)).not.toBe('wallet.topup.callbackChargedDeclined');
  });
});
