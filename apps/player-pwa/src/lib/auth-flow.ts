/**
 * Session-scoped persistence for the auth flow's UI state (channel + email
 * draft).
 *
 * WHY (2026-09-11 report): login channel ('phone' | 'email') and the typed
 * email lived in component-local state. Any remount/reload — the deliberate
 * full reload on language toggle, a service-worker activation reload, or
 * coming back from the verify screen — reset the flow to phone mode with an
 * empty form. Now the flow state survives everything short of closing the
 * tab (sessionStorage = per-tab, auto-cleared when the tab dies; no stale
 * cross-session leakage).
 *
 * Consumers:
 *  - login page: initializes mode/email from here, writes on every change.
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
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSet = (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // Private mode — the in-memory state still works for this page.
    }
};

const safeRemove = (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(key);
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
