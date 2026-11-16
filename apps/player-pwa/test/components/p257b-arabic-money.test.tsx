import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';
import PublishWarningSheet from '@/components/host/PublishWarningSheet';

/**
 * P2-257b (run #193, Reviewer B #164 census): money surfaces OUTSIDE the
 * wallet page still rendered Latin digits via bare `toFixed(2)` templates.
 * This pins the AR behavior on the worst offender (PublishWarningSheet — the
 * host's pre-publish money decision sheet) and bans the old template shapes
 * in all three census files.
 */

function renderSheetAr(props: Partial<Parameters<typeof PublishWarningSheet>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={arMessages} locale="ar">
      <PublishWarningSheet
        open
        mode="koralink"
        consentAccepted
        onConsentChange={() => {}}
        onTopUp={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        isPending={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('P2-257b — Arabic-Indic money numerals outside the wallet', () => {
  it('AR deposit card renders Arabic-Indic digits with ر.س (no Latin digits, no bare SAR)', () => {
    renderSheetAr({ depositSar: 375, walletBalanceSar: 500, balanceResolved: true });
    const card = screen.getByTestId('deposit-card');
    expect(card.textContent).toContain('٣٧٥');
    expect(card.textContent).toContain('ر.س');
    expect(card.textContent).not.toMatch(/[0-9]/);
  });

  it('AR shortfall message interpolates Arabic-Indic amount (formatAmount, not toFixed)', () => {
    renderSheetAr({ depositSar: 375, walletBalanceSar: 120, balanceResolved: true });
    const alert = screen.getByTestId('wallet-shortfall');
    expect(alert.textContent).toContain('٢٥٥');
    expect(alert.textContent).not.toMatch(/[0-9]/);
  });

  it('EN deposit card keeps the historical "SAR 375.00" shape byte-identical', () => {
    render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <PublishWarningSheet
          open
          mode="koralink"
          consentAccepted
          onConsentChange={() => {}}
          onTopUp={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
          isPending={false}
          depositSar={375}
          walletBalanceSar={500}
          balanceResolved={true}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('deposit-card').textContent).toMatch(/SAR\s?375\.00/);
  });

  it('structure: the three census files carry NO bare toFixed/SAR money templates', () => {
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
    const payment = read('../../src/components/payment/PaymentSheet.tsx');
    const costFooter = read('../../src/components/host/CostFooter.tsx');
    const pws = read('../../src/components/host/PublishWarningSheet.tsx');
    // The banned shapes: `{currency} {x.toFixed(2)}`, `SAR {x.toFixed(...)}`,
    // `SAR {x}` interpolation, and message-embedded bare toFixed.
    expect(payment).not.toMatch(/\{currency\} \{.*\.toFixed/);
    expect(costFooter).not.toMatch(/SAR \{/);
    expect(pws).not.toMatch(/SAR \{/);
    expect(pws).not.toMatch(/\.toFixed\(2\)/);
    expect(pws).toContain('formatAmount(shortfallSar, intlLocale)');
  });
});

describe('P2-257b r2 — recurring-deposit breakdown carries Arabic-Indic week count (PR-Agent r1)', () => {
  it('AR breakdown: both the amount AND the week count render Arabic-Indic digits', () => {
    renderSheetAr({ depositSar: 750, repeatWeeks: 2, walletBalanceSar: 900, balanceResolved: true });
    const card = screen.getByTestId('deposit-card');
    expect(card.textContent).toContain('٣٧٥');
    expect(card.textContent).toContain('×');
    expect(card.textContent).toContain('٢');
    // No Latin digit anywhere in the deposit card.
    expect(card.textContent).not.toMatch(/[0-9]/);
  });

  it('EN breakdown keeps Latin digits ("SAR 375.00 × 2")', () => {
    render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <PublishWarningSheet
          open
          mode="koralink"
          consentAccepted
          onConsentChange={() => {}}
          onTopUp={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
          isPending={false}
          depositSar={750}
          repeatWeeks={2}
          walletBalanceSar={900}
          balanceResolved={true}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('deposit-breakdown').textContent).toMatch(/SAR\s?375\.00 × 2/);
  });
});
