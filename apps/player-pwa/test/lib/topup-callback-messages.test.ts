import { describe, expect, it } from 'vitest';

import { topupCallbackMessageKey } from '@/lib/topup-callback-messages';

/** Fake fetcher-shaped errors (FetchError carries the API body message). */
function errWithMessage(message: string): { name: string; message: string; status: number } {
  return { name: 'FetchError', message, status: 409 };
}

describe('topupCallbackMessageKey — P2-276 (run #175)', () => {
  it('amount_mismatch maps to the charged copy (money LEFT the account)', () => {
    expect(
      topupCallbackMessageKey(
        errWithMessage(
          'amount_mismatch: payment 5000 halalas != intent 2000 halalas — no money was credited',
        ),
      ),
    ).toBe('wallet.topup.callbackAmountMismatch');
  });

  it('currency_mismatch maps to the charged copy too', () => {
    expect(
      topupCallbackMessageKey(
        errWithMessage('currency_mismatch: payment currency is not SAR'),
      ),
    ).toBe('wallet.topup.callbackAmountMismatch');
  });

  it('payment_not_paid maps to the safe not-charged copy', () => {
    expect(
      topupCallbackMessageKey(
        errWithMessage(
          'payment_not_paid: the payment is not completed yet — no money was credited',
        ),
      ),
    ).toBe('wallet.topup.notPaid');
  });

  it('payment_intent_mismatch maps to the safe not-charged copy', () => {
    expect(
      topupCallbackMessageKey(
        errWithMessage(
          'payment_intent_mismatch: this payment was not created for this top-up intent — no money was credited',
        ),
      ),
    ).toBe('wallet.topup.notPaid');
  });

  it('unknown errors fall back to the retry/auto-refund copy', () => {
    expect(topupCallbackMessageKey(errWithMessage('Internal server error'))).toBe(
      'wallet.topup.callbackRetry',
    );
    expect(topupCallbackMessageKey(new Error('network down'))).toBe(
      'wallet.topup.callbackRetry',
    );
    expect(topupCallbackMessageKey(undefined)).toBe('wallet.topup.callbackRetry');
  });

  it('a message merely CONTAINING a prefix does not match (prefix-only contract)', () => {
    expect(
      topupCallbackMessageKey(
        errWithMessage('wrapped error about amount_mismatch somewhere later'),
      ),
    ).toBe('wallet.topup.callbackRetry');
  });
});
