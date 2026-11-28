import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// D-20261127-02 (wallet-credit truth): the wallet balance is in-app credit for
// bookings only — there is no cash-out. These pins stop a copy/UI revert from
// re-advertising a withdrawal that does not exist (terms + wallet action row).

// This spec lives in test/ — one level up = the PWA package root.
const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

describe('wallet credit truth pins (D-20261127-02)', () => {
  const en = JSON.parse(read('src/messages/en.json'));
  const ar = JSON.parse(read('src/messages/ar.json'));
  const walletPage = read('src/app/[locale]/(main)/wallet/page.tsx');

  it('EN terms keep the ledger sentence and state credit is not cash / not withdrawable', () => {
    const body = en.legal.termsPaymentsBody3 as string;
    expect(body).toMatch(/^The in-app wallet can be topped up; every transaction is recorded in the wallet ledger with a viewable receipt\./);
    expect(body).toMatch(/in-app credit that can be used only for bookings inside KoraLink/);
    expect(body).toMatch(/not cash and cannot be withdrawn or transferred/);
    expect(body).toMatch(/withdrawals are not available at launch/);
  });

  it('AR terms mirror the credit sentence (legal-meaning parity)', () => {
    const body = ar.legal.termsPaymentsBody3 as string;
    expect(body.startsWith('يمكن شحن المحفظة داخل التطبيق، وتُسجل كل عملية في سجل المحفظة مع إيصال قابل للعرض.')).toBe(true);
    expect(body).toContain('رصيداً داخل التطبيق');
    expect(body).toContain('إلا للحجوزات عبر كورا لينك');
    expect(body).toContain('ولا يُعدّ نقداً');
    expect(body).toContain('ولا يجوز سحبه أو تحويله');
    expect(body).toContain('ولا تتوفر خدمة السحب عند الإطلاق');
  });

  it('wallet.credit + wallet.creditNote exist in both locales; wallet.withdraw is gone', () => {
    for (const msgs of [en, ar]) {
      expect(typeof msgs.wallet.credit).toBe('string');
      expect(typeof msgs.wallet.creditNote).toBe('string');
      expect(msgs.wallet).not.toHaveProperty('withdraw');
    }
    expect(en.wallet.credit).toBe('In-app credit');
    expect(en.wallet.creditNote).toMatch(/withdrawals are not available/);
    expect(ar.wallet.credit).toBe('رصيد داخل التطبيق');
    expect(ar.wallet.creditNote).toContain('لا تتوفر خدمة السحب');
  });

  it('wallet page renders the credit note slot, never a withdraw action', () => {
    expect(walletPage).not.toContain("t('wallet.withdraw')");
    expect(walletPage).toMatch(/label: t\('wallet\.credit'\)[^\n]*showToast\(t\('wallet\.creditNote'\)/);
  });
});
