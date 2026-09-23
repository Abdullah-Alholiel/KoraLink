/**
 * Session-scoped persistence for the auth flow's UI state (channel + email/phone
 * drafts).
 *
 * WHY (2026-09-11 report): login channel ('phone' | 'email') and the typed
 * email lived in component-local state. Any remount/reload — the deliberate
 * full reload on language toggle, a service-worker activation reload, or a
 * round-trip to the verify screen — reset the flow to phone mode with an
 * empty form.
 *
 * WHY localStorage, not sessionStorage (2026-09-17 report — "still the same
 * glitch"): the dominant real-world remount is the user LEAVING THE APP to
 * read the OTP from their SMS/email app, then coming back. On iOS the
 * backgrounded PWA tab is routinely discarded meanwhile — and sessionStorage
 * dies with the discarded tab. The drafts now live in localStorage, which
 * survives tab discard, SW-activation reloads, and locale-toggle reloads.
 * They are removed when the flow FINISHES (clearAuthFlow on verified success
 * and on moderation-block sign-out) so they never leak into a future login;
 * a leftover draft on the next visit is the intended "resume where you left
 * off" behavior on the user's own device.
 *
 * Consumers:
 *  - login page: initializes mode/email/phone from here, writes on every change.
 *  - verify page: clears the whole flow on successful verification.
 *
 * All access is try/catch-guarded (private-mode Safari throws on storage).
 */

export type AuthChannel = 'phone' | 'email';

const CHANNEL_KEY = 'koralink_auth_channel';
const EMAIL_DRAFT_KEY = 'koralink_auth_email_draft';
const PHONE_DRAFT_KEY = 'koralink_auth_phone_draft';

const safeGet = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSet = (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Private mode — the in-memory state still works for this page.
    }
};

const safeRemove = (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
};

export const getAuthChannel = (): AuthChannel =>
    safeGet(CHANNEL_KEY) === 'email' ? 'email' : 'phone';

export const setAuthChannel = (channel: AuthChannel): void => {
    safeSet(CHANNEL_KEY, channel);
};

export const getAuthEmailDraft = (): string => safeGet(EMAIL_DRAFT_KEY) ?? '';

export const setAuthEmailDraft = (email: string): void => {
    safeSet(EMAIL_DRAFT_KEY, email);
};

export const getAuthPhoneDraft = (): string => safeGet(PHONE_DRAFT_KEY) ?? '';

export const setAuthPhoneDraft = (phone: string): void => {
    safeSet(PHONE_DRAFT_KEY, phone);
};

/** Flow finished (verified) — drafts must not leak into a future login. */
export const clearAuthFlow = (): void => {
    safeRemove(CHANNEL_KEY);
    safeRemove(EMAIL_DRAFT_KEY);
    safeRemove(PHONE_DRAFT_KEY);
};
