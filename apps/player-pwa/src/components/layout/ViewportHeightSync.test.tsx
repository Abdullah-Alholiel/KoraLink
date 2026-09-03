import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ViewportHeightSync from './ViewportHeightSync';

/**
 * iOS standalone bottom-gap fix (Abdullah, 2026-09-03): in standalone mode
 * iOS misreports 100dvh as the small-viewport height, so the fixed shell
 * ends short and a dead strip shows below BottomNav. ViewportHeightSync must
 * pin --app-height to window.innerHeight — and ONLY in standalone mode
 * (browser tab dvh is correct; overriding there would break keyboard/toolbar
 * tracking).
 */

const setPropertySpy = vi.spyOn(
    document.documentElement.style,
    'setProperty'
);

function mockStandalone(standalone: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({ matches: standalone, media: '(display-mode: standalone)' })
    );
    (window as unknown as { matchMedia: unknown }).matchMedia = vi
        .fn()
        .mockReturnValue({ matches: standalone, media: '(display-mode: standalone)' });
}

describe('ViewportHeightSync', () => {
    beforeEach(() => {
        setPropertySpy.mockClear();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('pins --app-height to innerHeight when running standalone (installed PWA)', () => {
        mockStandalone(true);
        render(<ViewportHeightSync />);
        expect(setPropertySpy).toHaveBeenCalledWith(
            '--app-height',
            `${window.innerHeight}px`
        );
    });

    it('does NOT touch --app-height in a normal browser tab (dvh is correct there)', () => {
        mockStandalone(false);
        render(<ViewportHeightSync />);
        expect(setPropertySpy).not.toHaveBeenCalled();
    });
});
