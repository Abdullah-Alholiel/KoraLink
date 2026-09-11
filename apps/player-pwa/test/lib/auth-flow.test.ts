/**
 * Unit tests — lib/auth-flow.ts (session-scoped auth flow state).
 *
 * Incident 2026-09-11: login channel + typed email/phone lived in
 * component-local state, so any remount (verify round-trip) or reload
 * (language toggle, SW activation) reset the user to phone mode with an
 * empty form.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    getAuthChannel,
    setAuthChannel,
    getAuthEmailDraft,
    setAuthEmailDraft,
    getAuthPhoneDraft,
    setAuthPhoneDraft,
    clearAuthFlow,
} from '@/lib/auth-flow';

describe('auth-flow session persistence', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('defaults to phone channel when nothing stored', () => {
        expect(getAuthChannel()).toBe('phone');
    });

    it('persists the chosen channel', () => {
        setAuthChannel('email');
        expect(getAuthChannel()).toBe('email');
        setAuthChannel('phone');
        expect(getAuthChannel()).toBe('phone');
    });

    it('persists the email + phone drafts independently', () => {
        setAuthEmailDraft('user@gmail.com');
        setAuthPhoneDraft('501234567');
        expect(getAuthEmailDraft()).toBe('user@gmail.com');
        expect(getAuthPhoneDraft()).toBe('501234567');
    });

    it('clearAuthFlow wipes channel AND both drafts (no leak into next login)', () => {
        setAuthChannel('email');
        setAuthEmailDraft('user@gmail.com');
        setAuthPhoneDraft('501234567');
        clearAuthFlow();
        expect(getAuthChannel()).toBe('phone');
        expect(getAuthEmailDraft()).toBe('');
        expect(getAuthPhoneDraft()).toBe('');
    });
});
