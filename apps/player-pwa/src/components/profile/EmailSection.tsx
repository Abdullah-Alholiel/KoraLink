'use client';

/**
 * EmailSection (P1-41 PWA residual — the piece that was blocked on the
 * host-onboarding staging collision; built in the owner session, 2026-09-06).
 *
 * Add/verify the account email + the transactional-email mute toggle.
 * Mirrors the API contract exactly (mailer.controller.ts):
 * - PATCH /email/me {email} → {email, emailVerified, verificationSent}
 *   (400 invalid / 409 taken, typed service exceptions)
 * - PATCH /email/me/resend (server-throttled 3/min; already-verified is a
 *   no-op returning verificationSent:false)
 * - email_muted rides PATCH /users/me (users.service update, P1-41 field)
 * Suppression is API-side (verified + unmuted + alive) — the UI only
 * reflects state, it never gates sends itself.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, ShieldCheck, AlertCircle } from 'lucide-react';
import {
    useUserProfile,
    useSetEmail,
    useResendEmailVerification,
    useUpdateEmailPreferences,
} from '@/hooks/useUser';
import FlatSectionLabel from './FlatSectionLabel';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSection() {
    const t = useTranslations('profile.emailSection');
    const { data: profile } = useUserProfile();
    const setEmail = useSetEmail();
    const resend = useResendEmailVerification();
    const updateEmailPrefs = useUpdateEmailPreferences();

    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resent, setResent] = useState(false);

    const email = profile?.email ?? null;
    const verified = Boolean(profile?.email_verified_at);
    const muted = profile?.email_muted ?? false;

    // The transient "sent" note is obsolete once the address verifies.
    useEffect(() => {
        if (verified) setResent(false);
    }, [verified]);

    if (!profile) return null;

    const submit = async () => {
        const value = draft.trim();
        if (!EMAIL_RE.test(value)) {
            setError(t('invalid'));
            return;
        }
        setError(null);
        try {
            await setEmail.mutateAsync(value);
            setEditing(false);
            setDraft('');
            setResent(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            setError(/409|in use|taken/i.test(msg) ? t('taken') : t('error'));
        }
    };

    const inputForm = (
        <div className="px-4 pb-4">
            <div className="flex gap-2">
                <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="name@example.com"
                    aria-label={t('inputLabel')}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-brand-black placeholder:text-gray-300"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={setEmail.isPending || draft.trim().length === 0}
                    className="shrink-0 rounded-xl bg-brand-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                    {setEmail.isPending ? t('saving') : email ? t('save') : t('add')}
                </button>
                {email && (
                    <button
                        type="button"
                        onClick={() => {
                            setEditing(false);
                            setDraft('');
                            setError(null);
                        }}
                        className="shrink-0 rounded-xl px-3 py-2 text-sm text-gray-500"
                    >
                        {t('cancel')}
                    </button>
                )}
            </div>
            {error && (
                <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> {error}
                </p>
            )}
            <p className="mt-2 text-xs text-gray-500">{t('why')}</p>
        </div>
    );

    if (!email || editing) {
        return (
            <div className="mt-1">
                <div className="flex items-center gap-3.5 px-6 pt-2 pb-1">
                    <Mail className="h-5 w-5 text-brand-green" strokeWidth={1.5} />
                    <p className="flex-1 text-sm font-medium text-brand-black">{t('title')}</p>
                </div>
                {inputForm}
            </div>
        );
    }

    return (
        <div className="mt-1">
            <FlatSectionLabel label={t('title')} />
            <div className="px-6 pb-4">
                <div className="flex items-center justify-between gap-3">
                    <p dir="ltr" className="truncate text-sm text-brand-black">
                        {email}
                    </p>
                    {verified ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-brand-green">
                            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} /> {t('verified')}
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 disabled:opacity-50"
                            disabled={resend.isPending || resent}
                            onClick={async () => {
                                try {
                                    await resend.mutateAsync();
                                    setResent(true);
                                } catch {
                                    setError(t('error'));
                                }
                            }}
                        >
                            {resent ? t('resent') : t('resend')}
                        </button>
                    )}
                </div>
                {!verified && resent && (
                    <p role="status" className="mt-1 text-xs text-gray-500">
                        {t('resentHint')}
                    </p>
                )}
                {error && (
                    <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> {error}
                    </p>
                )}
                <button
                    type="button"
                    className="mt-3 flex w-full items-center justify-between"
                    onClick={() => updateEmailPrefs.mutate({ emailMuted: !muted })}
                    aria-pressed={muted}
                >
                    <span className="text-sm font-medium text-brand-black">{t('mute')}</span>
                    <span
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${muted ? 'bg-gray-200' : 'bg-brand-green'}`}
                        role="switch"
                        aria-checked={!muted}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${muted ? 'translate-x-0.5 rtl:-translate-x-0.5' : 'translate-x-5 rtl:-translate-x-5'}`}
                        />
                    </span>
                </button>
                <p className="mt-1 text-xs text-gray-500">{t('muteHint')}</p>
                <button
                    type="button"
                    className="mt-2 text-xs text-gray-400 underline"
                    onClick={() => {
                        setEditing(true);
                        setDraft(email);
                    }}
                >
                    {t('change')}
                </button>
            </div>
        </div>
    );
}
