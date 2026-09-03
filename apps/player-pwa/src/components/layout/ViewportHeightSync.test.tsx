import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ViewportHeightSync from './ViewportHeightSync';

/**
 * iOS standalone bottom-gap fix v2 (Abdullah, 2026-09-03): in standalone mode
 * iOS misreports dvh AND innerHeight as the small-viewport height (safe areas
 * excluded), so the fixed shell ends short and a dead strip shows below
 * BottomNav. v2 pins --app-height to the PHYSICAL screen height — the max of
 * every viewport measure the platform offers (screen.width/height guard the
 * orientation quirk) — and only in standalone. Browser tab keeps the dvh
 * default (correct there; drives keyboard/toolbar tracking).
 */

function mockViewport({
    standalone,
    inner = 818,
    client = 818,
    screenH = 852,
    screenW = 852, // orientation quirk: long edge on the wrong axis
    availH = 852,
}: {
    standalone: boolean;
    inner?: number;
    client?: number;
    screenH?: number;
    screenW?: number;
    availH?: number;
}) {
    const mm = vi.fn().mockReturnValue({ matches: standalone, media: '(display-mode: standalone)' });
    Object.defineProperty(window, 'matchMedia', { value: mm, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: inner, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: client, configurable: true });
    Object.defineProperty(window, 'screen', {
        value: { height: screenH, width: screenW, availHeight: availH, availWidth: screenW },
        configurable: true,
    });
}

const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');

describe('ViewportHeightSync (v2 — physical height pin)', () => {
    beforeEach(() => {
        setPropertySpy.mockClear();
    });
    afterEach(() => {
        cleanup();
    });

    it('pins --app-height to the PHYSICAL screen height in standalone (not innerHeight)', () => {
        mockViewport({ standalone: true });
        render(<ViewportHeightSync />);
        // innerHeight=818 is the misreported small viewport; screen says 852.
        expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '852px');
    });

    it('picks the long edge across the orientation quirk (max of width/height)', () => {
        mockViewport({ standalone: true, screenH: 390, screenW: 844, availH: 844 });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '844px');
    });

    it('does NOT touch --app-height in a normal browser tab (dvh is correct there)', () => {
        mockViewport({ standalone: false });
        render(<ViewportHeightSync />);
        expect(setPropertySpy).not.toHaveBeenCalled();
    });
});
