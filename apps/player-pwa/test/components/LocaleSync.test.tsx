/**
 * LocaleSync — persists the URL's locale into NEXT_LOCALE + Zustand on every
 * view (language-toggle incident 2026-09-11: the cookie was never written, so
 * unprefixed navigations reverted users to their first-detected locale).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import LocaleSync from '@/components/layout/LocaleSync';

const setLocaleSpy = vi.fn();
let mockStoreState: { preferences: { locale: 'ar' | 'en' } } = {
    preferences: { locale: 'ar' },
};

vi.mock('@/store/useAppStore', () => ({
    useAppStore: {
        getState: () => ({
            preferences: mockStoreState.preferences,
            setLocale: setLocaleSpy,
        }),
    },
}));

describe('LocaleSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.cookie = 'NEXT_LOCALE=; max-age=0; path=/';
        localStorage.removeItem('koralink_locale');
        mockStoreState = { preferences: { locale: 'ar' } };
    });

    it('persists the URL locale to the cookie + mirror on mount', () => {
        render(<LocaleSync locale="en" />);
        expect(document.cookie).toContain('NEXT_LOCALE=en');
        expect(localStorage.getItem('koralink_locale')).toBe('en');
    });

    it('syncs the Zustand preference when it disagrees with the URL', () => {
        mockStoreState = { preferences: { locale: 'ar' } };
        render(<LocaleSync locale="en" />);
        expect(setLocaleSpy).toHaveBeenCalledWith('en');
    });

    it('does not rewrite the store when already in sync', () => {
        mockStoreState = { preferences: { locale: 'en' } };
        render(<LocaleSync locale="en" />);
        expect(setLocaleSpy).not.toHaveBeenCalled();
    });
});
