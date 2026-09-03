import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import PromoBillboard from './PromoBillboard';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

function renderWithLocale(locale: 'en' | 'ar') {
    const messages = locale === 'ar' ? arMessages : enMessages;
    return render(
        <NextIntlClientProvider messages={messages} locale={locale}>
            <PromoBillboard />
        </NextIntlClientProvider>
    );
}

describe('PromoBillboard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the host slide first with kicker, title, sub and CTA (EN)', () => {
        renderWithLocale('en');
        expect(screen.getAllByText('Host')).toHaveLength(2); // kicker + CTA
        expect(screen.getByText('Got a pitch? Gather your crew.')).toBeInTheDocument();
        expect(screen.getByText('You play free when you host.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Got a pitch? Gather your crew.' })).toHaveAttribute(
            'href',
            '/en/host'
        );
    });

    it('auto-advances to the clubs slide after 5s and locale-prefixes its href', () => {
        renderWithLocale('en');
        act(() => {
            vi.advanceTimersByTime(5100);
        });
        expect(screen.getByText('Find your football home.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Find your football home.' })).toHaveAttribute(
            'href',
            '/en/clubs'
        );
    });

    it('jumps to a slide when its dot is clicked (a11y-labelled buttons)', () => {
        renderWithLocale('en');
        fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2' }));
        expect(screen.getByText('Find your football home.')).toBeInTheDocument();
    });

    it('renders Arabic copy and /ar/ hrefs in the ar locale', () => {
        renderWithLocale('ar');
        expect(screen.getByText('عندك ملعب؟ اجمع لاعبيك.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'عندك ملعب؟ اجمع لاعبيك.' })).toHaveAttribute(
            'href',
            '/ar/host'
        );
    });

    it('does not advance while the tab is hidden', () => {
        renderWithLocale('en');
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        act(() => {
            vi.advanceTimersByTime(11000);
        });
        // still on the host slide
        expect(screen.getByText('Got a pitch? Gather your crew.')).toBeInTheDocument();
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
});
