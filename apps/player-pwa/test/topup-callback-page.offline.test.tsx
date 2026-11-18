import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../src/messages/en.json';
import ar from '../src/messages/ar.json';

/**
 * P2-379 (run #214) — top-up callback offline-state tripwire.
 * Source pins (legal-sections.test.ts pattern): the page must keep the
 * offline branch, the retry affordance, and the code-first classifier
 * import — removing any of them silently regresses the money surface.
 */
const PAGE = readFileSync(
  resolve(__dirname, '../src/app/[locale]/wallet/topup/callback/page.tsx'),
  'utf8',
);

describe('topup callback page — offline state pins (P2-379)', () => {
  it('sources the shared online hook + offline icon', () => {
    expect(PAGE).toContain("from '@/hooks/useOnlineStatus'");
    expect(PAGE).toContain('WifiOff');
  });

  it('renders the dedicated offline copy (never the generic failure line)', () => {
    expect(PAGE).toContain('wallet.topup.callbackOffline');
  });

  it('offers an in-place retry when ids survive (canRetry gate)', () => {
    expect(PAGE).toContain('canRetry');
    expect(PAGE).toContain('retryVerify');
    expect(PAGE).toContain('wallet.topup.recoveryRetry');
  });

  it('classifies failures via the code-first matcher', () => {
    expect(PAGE).toContain("from '@/lib/topup-callback-messages'");
    expect(PAGE).toContain('topupCallbackMessageKey(err)');
  });

  it('never clears session ids on offline/failed outcomes (retry stays possible)', () => {
    const clears = PAGE.match(/removeItem\(TOPUP_/g) ?? [];
    expect(clears.length).toBe(2); // success path only
    expect(PAGE).toContain('startedRef.current = false');
  });

  it('back-to-wallet buttons carry localized aria-labels (a11y)', () => {
    expect((PAGE.match(/backToWalletAria/g) ?? []).length).toBe(2);
  });
});

describe('topup i18n — offline keys EN+AR parity (P2-379)', () => {
  const enTopup = (en as unknown as { wallet: { topup: Record<string, string> } }).wallet.topup;
  const arTopup = (ar as unknown as { wallet: { topup: Record<string, string> } }).wallet.topup;

  it('callbackOffline + backToWalletAria exist in both locales, non-empty', () => {
    for (const key of ['callbackOffline', 'backToWalletAria']) {
      expect(typeof enTopup[key]).toBe('string');
      expect(enTopup[key].length).toBeGreaterThan(0);
      expect(typeof arTopup[key]).toBe('string');
      expect(arTopup[key].length).toBeGreaterThan(0);
    }
  });

  it('AR offline copy never claims money was taken or credited', () => {
    expect(arTopup.callbackOffline).not.toContain('تم إيداع');
    expect(arTopup.callbackOffline).not.toContain('لم يُخصم');
  });
});

describe('topup callback tripwire — matcher module present', () => {
  it('classifier module exists on disk', () => {
    expect(
      existsSync(resolve(__dirname, '../src/lib/topup-callback-messages.ts')),
    ).toBe(true);
  });
});
