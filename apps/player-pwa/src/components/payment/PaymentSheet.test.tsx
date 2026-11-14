/**
 * PaymentSheet — currency propagation (P2-239, Reviewer B run #153 I2).
 *
 * The sheet hardcoded the literal "SAR" in all four money cells while the
 * match page already renders `match.currency` and passes it to the sibling
 * booking component (OngoingGameJoinSheet). A non-SAR match would show the
 * wrong currency on a money surface. The page now passes `currency` through
 * and the sheet renders it, defaulting to 'SAR' (house pattern, mirrors
 * OngoingGameJoinSheet).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/match/m-1',
}));

import PaymentSheet from './PaymentSheet';

type SheetProps = Parameters<typeof PaymentSheet>[0];

function renderSheet(overrides: Partial<SheetProps> = {}, locale: 'en' | 'ar' = 'en') {
    const props: SheetProps = {
        isOpen: true,
        onClose: () => {},
        onPaySuccess: () => {},
        matchTitle: 'Friday Night 7v7',
        matchTime: 'Fri, 8:00 PM',
        matchLocation: 'Riyadh Arena',
        matchId: 'm-1',
        price: 40,
        walletBalance: 100, // affordable: CTA renders "Pay with Wallet <amount>"
        ...overrides,
    };
    return render(
        <NextIntlClientProvider
            messages={locale === 'ar' ? arMessages : enMessages}
            locale={locale}
        >
            <PaymentSheet {...props} />
        </NextIntlClientProvider>,
    );
}

describe('PaymentSheet currency', () => {
    it('renders the currency passed by the match page in every money cell', () => {
        renderSheet({ currency: 'AED', price: 40, walletBalance: 100 });
        // Price row (Total) + CTA ("Pay with Wallet AED 40.00") both carry it.
        expect(screen.getAllByText(/AED 40\.00/)).toHaveLength(2);
        expect(screen.getByText('AED 100.00')).toBeInTheDocument(); // wallet row
        expect(screen.getByText('AED 0.00')).toBeInTheDocument(); // to-pay row
        expect(screen.queryByText(/SAR/)).not.toBeInTheDocument();
    });

    it('defaults to SAR when no currency prop is passed (back-compat)', () => {
        renderSheet({ price: 40, walletBalance: 100 });
        expect(screen.getAllByText(/SAR 40\.00/)).toHaveLength(2);
        expect(screen.getByText('SAR 100.00')).toBeInTheDocument();
        expect(screen.queryByText(/AED/)).not.toBeInTheDocument();
    });

    it('shows the to-pay amount in the match currency', () => {
        renderSheet({ currency: 'AED', price: 40, walletBalance: 10 });
        expect(screen.getByText('AED 30.00')).toBeInTheDocument();
    });

    it('renders the match currency in the Arabic locale with Arabic-Indic numerals (P2-257b)', () => {
        // P2-257b (run #193): the old expectation pinned the LATIN shape
        // ("AED 30.00") under locale=ar — that was the exact defect this
        // census fixes (Latin digits on an AR money surface, banned by the
        // owner's numeral standard / BlockedCard convention). formatMoney
        // now yields Intl's ar-SA shape: Arabic-Indic digits + localized
        // symbol — "٣٠٫٠٠ د.إ." (mirrors the wallet page's ر.س precedent).
        renderSheet({ currency: 'AED', price: 40, walletBalance: 10 }, 'ar');
        const text = document.body.textContent ?? '';
        expect(text).toMatch(/٣٠٫٠٠/);
        expect(text).toContain('د.إ');
        expect(text).not.toMatch(/AED 30\.00/);
    });
});
