/**
 * PromoBillboard swipe tests (2026-09-04).
 *
 * Abdullah: "make the promo hero in feed scrollable by finger on phone".
 * The billboard previously auto-advanced only — no finger swipe. The carousel
 * now carries `touch-pan-y` so vertical travel always chains to the feed
 * scroller (the browser axis-locks), and deliberate horizontal travel
 * (≥48px, the ViewPager2-style threshold) flips the slide — mirrored in RTL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import PromoBillboard, { swipeToStep } from './PromoBillboard';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

function renderWithLocale(locale: 'en' | 'ar') {
    const messages = locale === 'ar' ? arMessages : enMessages;
    return render(
        <NextIntlClientProvider messages={messages} locale={locale}>
            <PromoBillboard />
        </NextIntlClientProvider>
    );
}

/** Simulates a finger drag across the carousel: touchstart → touchmove(s) → touchend. */
function swipe(carousel: HTMLElement, fromX: number, toX: number, steps = 4) {
    const y = 10;
    fireEvent.touchStart(carousel, {
        touches: [{ clientX: fromX, clientY: y }],
    });
    for (let s = 1; s <= steps; s++) {
        const x = fromX + ((toX - fromX) * s) / steps;
        fireEvent.touchMove(carousel, {
            touches: [{ clientX: x, clientY: y }],
        });
    }
    fireEvent.touchEnd(carousel, { touches: [] });
}

describe('PromoBillboard — finger swipe', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('next slide on left swipe (LTR)', () => {
        renderWithLocale('en');
        swipe(screen.getByTestId('promo-carousel'), 300, 60);
        expect(screen.getByText('Find your football home.')).toBeInTheDocument();
    });

    it('previous slide on right swipe, wrapping to the last slide (LTR)', () => {
        renderWithLocale('en');
        swipe(screen.getByTestId('promo-carousel'), 60, 300);
        // goTo wraps: "previous" from the first slide lands on the LAST slide (clubs)
        expect(screen.getByText('Find your football home.')).toBeInTheDocument();
    });

    it('RTL mirrors the axis: swiping RIGHT goes to the next slide', () => {
        renderWithLocale('ar');
        swipe(screen.getByTestId('promo-carousel'), 60, 300);
        expect(screen.getByText('ملاعب وأندية قريبة منك.')).toBeInTheDocument();
    });

    it('small drags below the 48px threshold do NOT change the slide', () => {
        renderWithLocale('en');
        swipe(screen.getByTestId('promo-carousel'), 300, 270);
        expect(screen.getByText('Get players together. You play free.')).toBeInTheDocument();
    });

    it('auto-advance restarts its 5s clock after a swipe (fresh slide is not cut short)', () => {
        renderWithLocale('en');
        swipe(screen.getByTestId('promo-carousel'), 300, 60);
        // 3s after the swipe: still on clubs (clock restarted at swipe time)
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(screen.getByText('Venues and clubs near you.')).toBeInTheDocument();
        // 5s after the swipe: auto-advance fires again
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByText('Get players together. You play free.')).toBeInTheDocument();
    });

    it('dot click also restarts the auto-advance clock', () => {
        renderWithLocale('en');
        act(() => {
            vi.advanceTimersByTime(2500);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2' }));
        act(() => {
            vi.advanceTimersByTime(4900);
        });
        // 2.5 + 4.9 = 7.4s after mount, but only 4.9s after the dot click → still clubs
        expect(screen.getByText('Venues and clubs near you.')).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.getByText('Get players together. You play free.')).toBeInTheDocument();
    });

    it('carousel keeps touch-pan-y so vertical finger travel always chains to the feed scroller', () => {
        renderWithLocale('en');
        expect(screen.getByTestId('promo-carousel').className).toContain('touch-pan-y');
    });
});

describe('swipeToStep — RTL-mirrored direction mapping', () => {
    it('negative dx (leftward) maps to +1 (next)', () => {
        expect(swipeToStep(-80)).toBe(1);
    });
    it('positive dx (rightward) maps to -1 (previous)', () => {
        expect(swipeToStep(80)).toBe(-1);
    });
    it('dx of 0 maps to previous (no movement → no direction)', () => {
        expect(swipeToStep(0)).toBe(-1);
    });
});

describe('PromoBillboard — auto-advance (original behavior, preserved)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the host slide first with kicker, title, sub, CTA and free-play hint (EN)', () => {
        renderWithLocale('en');
        expect(screen.getByText('Hosting')).toBeInTheDocument();
        expect(screen.getByText('Host a Match')).toBeInTheDocument();
        expect(screen.getByText('Get players together. You play free.')).toBeInTheDocument();
        expect(screen.getByText('Start hosting')).toBeInTheDocument();
        expect(screen.getByText('HOST PLAYS FREE')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Host a Match' })).toHaveAttribute('href', '/en/host');
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
        expect(screen.getByText('اجمع اللاعبين. أنت تلعب مجاناً.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'استضف مباراة' })).toHaveAttribute(
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
        expect(screen.getByText('Get players together. You play free.')).toBeInTheDocument();
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
});
