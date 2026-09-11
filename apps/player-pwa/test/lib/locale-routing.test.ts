/**
 * Unit tests — lib/locale-routing.ts (single source of truth for locale
 * persistence + locale-aware navigation; language-toggle incident 2026-09-11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    normalizeLocale,
    localeFromPath,
    persistLocale,
    readPersistedLocale,
    navigatePreservingLocale,
} from '@/lib/locale-routing';

const assignMock = vi.fn();

describe('locale-routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.cookie = 'NEXT_LOCALE=; max-age=0; path=/';
        localStorage.removeItem('koralink_locale');
        Object.defineProperty(window, 'location', {
            writable: true,
            value: { ...window.location, assign: assignMock, pathname: '/en/login', href: 'http://localhost/en/login' },
        });
    });

    it('normalizeLocale: anything unknown falls back to ar (app default)', () => {
        expect(normalizeLocale('en')).toBe('en');
        expect(normalizeLocale('ar')).toBe('ar');
        expect(normalizeLocale('fr')).toBe('ar');
        expect(normalizeLocale(undefined)).toBe('ar');
    });

    it('localeFromPath reads the URL segment', () => {
        window.location.pathname = '/ar/play';
        expect(localeFromPath()).toBe('ar');
        window.location.pathname = '/en/login';
        expect(localeFromPath()).toBe('en');
        window.location.pathname = '/login';
        expect(localeFromPath()).toBe('ar');
    });

    it('persistLocale writes NEXT_LOCALE cookie + localStorage mirror', () => {
        persistLocale('en');
        expect(document.cookie).toContain('NEXT_LOCALE=en');
        expect(localStorage.getItem('koralink_locale')).toBe('en');
        expect(readPersistedLocale()).toBe('en');
    });

    it('readPersistedLocale falls back to the localStorage mirror', () => {
        localStorage.setItem('koralink_locale', 'en');
        expect(readPersistedLocale()).toBe('en');
        expect(readPersistedLocale()).toBe('en');
    });

    it('navigatePreservingLocale prefixes bare paths with the CURRENT URL locale', () => {
        window.location.pathname = '/en/play';
        navigatePreservingLocale('/login');
        expect(assignMock).toHaveBeenCalledWith('/en/login');
        expect(document.cookie).toContain('NEXT_LOCALE=en');
    });

    it('navigatePreservingLocale keeps explicit locale paths and persists them', () => {
        window.location.pathname = '/en/login';
        navigatePreservingLocale('/ar/login');
        expect(assignMock).toHaveBeenCalledWith('/ar/login');
        expect(document.cookie).toContain('NEXT_LOCALE=ar');
    });

    it('navigatePreservingLocale maps bare "/" to the locale root', () => {
        window.location.pathname = '/ar/play';
        navigatePreservingLocale('/');
        expect(assignMock).toHaveBeenCalledWith('/ar');
    });
});
