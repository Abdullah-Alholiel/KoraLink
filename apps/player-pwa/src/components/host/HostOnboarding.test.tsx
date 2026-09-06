/**
 * HostOnboarding wizard tests (2026-09-04).
 *
 * Abdullah: onboarding screens before the host-a-match form — two hosting
 * modes explained, host duties before/during/after the game, rewards incl.
 * the equipment-after-3-games email offer. The wizard is swipeable like the
 * PromoBillboard (48px threshold, RTL-mirrored), and skip/finish both persist
 * the seen flag. Tests colocate with the component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import HostOnboarding, {
    HOST_ONBOARDING_SEEN_KEY,
    readHostOnboardingSeen,
    writeHostOnboardingSeen,
} from './HostOnboarding';
import { trackEvent } from '@/providers/ObservabilityProvider';

vi.mock('@/providers/ObservabilityProvider', () => ({
    trackEvent: vi.fn(),
}));

function renderWizard(locale: 'en' | 'ar' = 'en') {
    const messages = locale === 'ar' ? arMessages : enMessages;
    return render(
        <NextIntlClientProvider messages={messages} locale={locale}>
            <HostOnboarding onFinished={onFinished} />
        </NextIntlClientProvider>
    );
}

const onFinished = vi.fn();

/** Finger drag on the deck: touchstart → touchmove steps → touchend. */
function swipe(deck: HTMLElement, fromX: number, toX: number, steps = 4) {
    const y = 10;
    fireEvent.touchStart(deck, { touches: [{ clientX: fromX, clientY: y }] });
    for (let s = 1; s <= steps; s++) {
        const x = fromX + ((toX - fromX) * s) / steps;
        fireEvent.touchMove(deck, { touches: [{ clientX: x, clientY: y }] });
    }
    fireEvent.touchEnd(deck, { touches: [] });
}

describe('HostOnboarding — seen-flag helpers', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it('defaults to unseen and round-trips the flag', () => {
        expect(readHostOnboardingSeen()).toBe(false);
        writeHostOnboardingSeen();
        expect(window.localStorage.getItem(HOST_ONBOARDING_SEEN_KEY)).toBe('1');
        expect(readHostOnboardingSeen()).toBe(true);
    });
});

describe('HostOnboarding — wizard flow', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it('opens on the hero slide with the host badge and Get Started CTA', () => {
        renderWizard();
        expect(screen.getByTestId('host-badge')).toHaveTextContent('HOST GUIDE');
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Become a KoraLink Host');
        expect(screen.getByTestId('onboarding-get-started')).toBeInTheDocument();
        expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument();
    });

    it('Get Started advances to the modes slide explaining BOTH hosting modes', () => {
        renderWizard();
        fireEvent.click(screen.getByTestId('onboarding-get-started'));
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Two ways to host');
        const modeCards = screen.getAllByTestId('mode-card');
        expect(modeCards).toHaveLength(2);
        expect(modeCards[0]).toHaveTextContent('Book via Us');
        expect(modeCards[1]).toHaveTextContent('Book by Yourself');
    });

    it('Next ×4 reaches the final slide whose CTA finishes with via=complete', () => {
        renderWizard();
        fireEvent.click(screen.getByTestId('onboarding-get-started'));
        for (let i = 0; i < 4; i++) {
            fireEvent.click(screen.getByTestId('onboarding-next'));
        }
        expect(screen.getByTestId('onboarding-done')).toBeInTheDocument();
        expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('onboarding-done'));
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(readHostOnboardingSeen()).toBe(true);
        expect(trackEvent).toHaveBeenCalledWith('host_onboarding_finished', expect.objectContaining({ via: 'complete' }));
    });

    it('Skip from the first slide finishes immediately with via=skip', () => {
        renderWizard();
        fireEvent.click(screen.getByTestId('onboarding-skip'));
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(readHostOnboardingSeen()).toBe(true);
        expect(trackEvent).toHaveBeenCalledWith('host_onboarding_finished', expect.objectContaining({ via: 'skip' }));
    });

    it('rewards slide carries the equipment-after-3-games email offer', () => {
        renderWizard();
        fireEvent.click(screen.getAllByTestId('onboarding-dot-4')[0]);
        expect(screen.getByTestId('equipment-reward')).toBeInTheDocument();
        expect(screen.getByTestId('equipment-reward')).toHaveTextContent('AFTER 3 GAMES');
        expect(screen.getByTestId('equipment-reward')).toHaveTextContent(
            "we'll email you a form"
        );
    });

    it('renders six dot indicators for six slides', () => {
        renderWizard();
        for (let i = 0; i < 6; i++) {
            expect(screen.getByTestId(`onboarding-dot-${i}`)).toBeInTheDocument();
        }
    });
});

describe('HostOnboarding — guide mode (permanent reference, profile → Host Guide)', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(trackEvent).mockClear();
        onFinished.mockClear();
    });

    function renderGuide(locale: 'en' | 'ar' = 'en') {
        const messages = locale === 'ar' ? arMessages : enMessages;
        return render(
            <NextIntlClientProvider messages={messages} locale={locale}>
                <HostOnboarding guide onFinished={onFinished} />
            </NextIntlClientProvider>
        );
    }

    it('shows a back arrow instead of Skip', () => {
        renderGuide();
        expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument();
        expect(screen.getByTestId('onboarding-guide-back')).toBeInTheDocument();
    });

    it('exiting from the guide NEVER writes the seen-flag (first-time hosts keep onboarding)', () => {
        renderGuide();
        fireEvent.click(screen.getByTestId('onboarding-guide-back'));
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(HOST_ONBOARDING_SEEN_KEY)).toBeNull();
        expect(trackEvent).toHaveBeenCalledWith('host_guide_closed', expect.anything());
    });

    it('Start Hosting counts as read: flag written; without a nav handler it falls back to onFinished', () => {
        renderGuide();
        fireEvent.click(screen.getByTestId('onboarding-get-started'));
        // Jump to the last slide via the dots.
        const dots = screen.getAllByRole('tab');
        fireEvent.click(dots[dots.length - 1]);
        fireEvent.click(screen.getByTestId('onboarding-done'));
        // They just read the whole guide — it counts as seen even when the
        // page didn't pass onStartHosting (fallback closes the guide).
        expect(window.localStorage.getItem(HOST_ONBOARDING_SEEN_KEY)).toBe('1');
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(trackEvent).toHaveBeenCalledWith('host_guide_finished', expect.anything());
    });

    it('Start Hosting on the last slide DOES write the flag and hands off to the host form', () => {
        const onStartHosting = vi.fn();
        render(
            <NextIntlClientProvider messages={enMessages} locale="en">
                <HostOnboarding guide onFinished={onFinished} onStartHosting={onStartHosting} />
            </NextIntlClientProvider>
        );
        fireEvent.click(screen.getByTestId('onboarding-get-started'));
        const dots = screen.getAllByRole('tab');
        fireEvent.click(dots[dots.length - 1]);
        fireEvent.click(screen.getByTestId('onboarding-done'));
        // They just read the whole guide — it counts as seen.
        expect(window.localStorage.getItem(HOST_ONBOARDING_SEEN_KEY)).toBe('1');
        expect(onStartHosting).toHaveBeenCalledTimes(1);
        expect(onFinished).not.toHaveBeenCalled();
        expect(trackEvent).toHaveBeenCalledWith('host_guide_finished', expect.anything());
    });
});

describe('HostOnboarding — swipe navigation', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it('deck keeps touch-pan-y so vertical scrolling always chains to the page', () => {
        renderWizard();
        expect(screen.getByTestId('onboarding-deck').className).toContain('touch-pan-y');
    });

    it('small drags below the 48px threshold do NOT change the slide', () => {
        renderWizard();
        swipe(screen.getByTestId('onboarding-deck'), 300, 285);
        expect(screen.getByTestId('slide-hero')).toBeInTheDocument();
    });

    it('LTR: swiping left goes forward to the modes slide', () => {
        renderWizard('en');
        swipe(screen.getByTestId('onboarding-deck'), 300, 60);
        expect(screen.getByTestId('slide-modes')).toBeInTheDocument();
    });

    it('RTL mirrors the axis: swiping RIGHT goes forward in Arabic', () => {
        renderWizard('ar');
        swipe(screen.getByTestId('onboarding-deck'), 60, 300);
        expect(screen.getByTestId('slide-modes')).toBeInTheDocument();
    });

    it('cannot swipe past the last slide', () => {
        renderWizard();
        // jump to the final slide via its dot, then swipe left hard
        fireEvent.click(screen.getByTestId('onboarding-dot-5'));
        swipe(screen.getByTestId('onboarding-deck'), 300, 60);
        expect(screen.getByTestId('slide-ready')).toBeInTheDocument();
        expect(screen.getByTestId('onboarding-done')).toBeInTheDocument();
    });
});
