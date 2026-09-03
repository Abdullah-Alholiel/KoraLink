import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ViewportHeightSync from './ViewportHeightSync';

/**
 * iOS standalone bottom-gap fix v3 (ground truth: Sentry event 05ee0962 —
 * Abdullah's iPhone, iOS 18.7, 428×926pt): in standalone the VISIBLE canvas is
 * 879pt; the bottom 47pt is outside the canvas and unpaintable by web code.
 * v1 pinned innerHeight (white strip below nav); v2 pinned screen.height 926
 * (nav labels buried under the unpaintable zone — Play label hidden). v3 pins
 * the VISIBLE CANVAS = max(innerHeight, clientHeight, visualViewport.height),
 * which all agree at 879 on his device. Browser tab: no-op (dvh correct).
 */

function mockViewport({
    standalone,
    inner = 879,
    client = 879,
    vvHeight = 879,
    screenH = 926,
    availH = 926,
}: {
    standalone: boolean;
    inner?: number;
    client?: number;
    vvHeight?: number;
    screenH?: number;
    availH?: number;
}) {
    const mm = vi.fn().mockImplementation((q: string) =>
        q === '(display-mode: standalone)'
            ? { matches: standalone, media: q, addEventListener: () => {}, removeEventListener: () => {} }
            : { matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }
    );
    Object.defineProperty(window, 'matchMedia', { value: mm, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: inner, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: client, configurable: true });
    Object.defineProperty(window.screen, 'height', { value: screenH, configurable: true });
    Object.defineProperty(window.screen, 'availHeight', { value: availH, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
        value: { height: vvHeight, offsetTop: 0, scale: 1, addEventListener: () => {}, removeEventListener: () => {} },
        configurable: true,
    });
}

const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');

describe('ViewportHeightSync (v3 — visible-canvas pin)', () => {
    beforeEach(() => {
        setPropertySpy.mockClear();
    });
    afterEach(() => {
        cleanup();
    });

    it('pins the VISIBLE canvas (879), never screen.height (926) — Sentry ground truth', () => {
        mockViewport({ standalone: true });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '879px');
        expect(setPropertySpy).not.toHaveBeenCalledWith('--app-height', '926px');
    });

    it('uses max of canvas measures (largest wins when one under-reports)', () => {
        mockViewport({ standalone: true, inner: 860, client: 879, vvHeight: 875 });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '879px');
    });

    it('keeps labels out of the unpaintable zone: canvas < screen always wins over screen', () => {
        mockViewport({ standalone: true, inner: 700, client: 700, vvHeight: 700, screenH: 926, availH: 926 });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '700px');
    });

    it('does NOT touch --app-height in a normal browser tab (dvh is correct there)', () => {
        mockViewport({ standalone: false });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).not.toHaveBeenCalled();
    });
});
