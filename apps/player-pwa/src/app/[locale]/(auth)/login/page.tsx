'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight, Trophy, Loader2, AlertCircle, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSendOtp, useSendEmailOtp } from '@/hooks/useAuth';
import DevLoginBar from '@/components/auth/DevLoginBar';
import { useRestoreAccount } from '@/hooks/useUser';

export default function LoginPage() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations('login');
    const tErrors = useTranslations('errors');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);

    // email-otp-login (run #46): phone-first by default; a subtle toggle
    // swaps the input to email. Both channels share the verify screen.
    const [mode, setMode] = useState<'phone' | 'email'>('phone');
    const [email, setEmail] = useState('');

    const sendOtp = useSendOtp();
    const sendEmailOtp = useSendEmailOtp();

    // Double-send guard: mutation.isPending only flips on the NEXT render, so
    // a fast double-tap fired two send-otp requests (the second either 429'd
    // on the server cooldown or sent a second email that invalidates the
    // first code). This flips synchronously inside the click handler.
    const [submitting, setSubmitting] = useState(false);

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    // P0-6 (run #30): when the user soft-deletes on profile, the restore
    // token persists to localStorage. Surface a one-tap "Restore" affordance
    // here so the user can recover their account without first being
    // bounced through the OTP flow. The fetcher falls back to the
    // `koralink_pdpl_restore_token` Bearer for /users/me/restore.
    const [restorePurgeAt, setRestorePurgeAt] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        setRestorePurgeAt(localStorage.getItem('koralink_pdpl_purge_at'));
    }, []);
    const restore = useRestoreAccount();
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const daysLeft = restorePurgeAt
        ? Math.max(0, Math.ceil((new Date(restorePurgeAt).getTime() - Date.now()) / 86_400_000))
        : 0;
    const restoreAvailable = restorePurgeAt !== null && daysLeft > 0;

    const handleRestore = async () => {
        setRestoreError(null);
        try {
            const profile = await restore.mutateAsync();
            // Restore succeeded — the backend returns the populated profile
            // but doesn't mint a fresh session JWT. We bounce the user to
            // the verify flow on their existing phone (read from the
            // restored profile if available) so they get a real session.
            // Fall back to /login if the profile shape is unexpected.
            const restoredPhone = (profile as { phone?: string })?.phone;
            if (restoredPhone) {
                router.push(`/${locale}/verify?phone=${restoredPhone}`);
            } else {
                router.push(`/${locale}/login`);
            }
        } catch {
            // error-message standard: no raw backend text on the login screen.
            setRestoreError(tErrors('unauthorized'));
        }
    };

    const handleContinue = () => {
        if (submitting) return;
        setError(null);
        if (mode === 'email') {
            if (!EMAIL_RE.test(email)) {
                setError(t('invalidEmail'));
                return;
            }
            setSubmitting(true);
            sendEmailOtp.mutate(
                { email: email.trim().toLowerCase() },
                {
                    onSuccess: () =>
                        router.push(`/${locale}/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`),
                    onError: () => setError(tErrors('otpSendFailed')),
                    onSettled: () => setSubmitting(false),
                },
            );
            return;
        }
        if (phone.length < 7) return;
        setSubmitting(true);
        sendOtp.mutate(
            { phone },
            {
                onSuccess: () => router.push(`/${locale}/verify?phone=${phone}`),
                onError: () => setError(tErrors('otpSendFailed')),
                onSettled: () => setSubmitting(false),
            },
        );
    };

    return (
        <div className="flex flex-col min-h-full px-6">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center gap-3 pt-[var(--top-safe-inset)] pb-4">
                <button
                    onClick={() => router.back()}
                    className="w-10 h-10 flex items-center justify-center"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
                <div className="flex items-center gap-2 flex-1 justify-center pe-10">
                    <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center">
                        <Trophy className="w-3.5 h-3.5 text-brand-green" strokeWidth={2.5} />
                    </div>
                    <span className="text-base font-bold text-brand-black">KoraLink</span>
                </div>
            </div>

            {/* ── Content ───────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center -mt-16">
                {/* P0-6 (run #30): restore banner when the user soft-deleted
                    on profile and the restore token is still valid. Tap →
                    fetcher falls back to the PDPL restore-token Bearer. */}
                {restoreAvailable && (
                    <div
                        role="alert"
                        data-testid="restore-account-banner"
                        className="w-full mt-4 mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
                    >
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-amber-800">
                                    {t('restoreAccount.title')}
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    {t('restoreAccount.body', { days: daysLeft })}
                                </p>
                                {restoreError && (
                                    <p className="text-xs text-brand-red mt-2">
                                        {restoreError}
                                    </p>
                                )}
                                <button
                                    onClick={handleRestore}
                                    disabled={restore.isPending}
                                    className="mt-3 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                                >
                                    {restore.isPending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    {t('restoreAccount.restore')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <h1 className="text-2xl font-bold text-brand-black text-center leading-tight">
                    {t('titleLine1')}
                    <br />
                    {t('titleLine2')}
                </h1>
                <p className="text-sm text-gray-400 mt-3 text-center">
                    {t('subtitleLine1')}
                    <br />
                    {t('subtitleLine2')}
                </p>

                {/* Phone Input (default channel) */}
                {mode === 'phone' ? (
                <div className="w-full mt-8 flex items-center gap-2 border-2 border-brand-green/30 rounded-2xl px-4 py-3.5 focus-within:border-brand-green transition-colors">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-lg">🇸🇦</span>
                        <span className="text-sm font-medium text-brand-black">+966</span>
                    </div>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder={t('phonePlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        maxLength={9}
                        autoFocus
                    />
                </div>
                ) : (
                /* Email Input (email-otp-login run #46) */
                <div className="w-full mt-8 flex items-center gap-2 border-2 border-brand-green/30 rounded-2xl px-4 py-3.5 focus-within:border-brand-green transition-colors">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <input
                        type="email"
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('emailPlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        autoComplete="email"
                        autoFocus
                    />
                </div>
                )}
            </div>

            {/* ── Bottom Section ────────────────────── */}
            <div className="pb-8 pb-safe">
                {/* Error */}
                {error && (
                    <p className="text-center text-sm text-brand-red mb-3">
                        {error}
                    </p>
                )}

                <button
                    onClick={handleContinue}
                    disabled={submitting || (mode === 'email' ? sendEmailOtp.isPending : sendOtp.isPending) || (mode === 'email' ? !EMAIL_RE.test(email) : phone.length < 7)}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${!(submitting || (mode === 'email' ? sendEmailOtp.isPending : sendOtp.isPending)) && (mode === 'email' ? EMAIL_RE.test(email) : phone.length >= 7)
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    {(submitting || (mode === 'email' ? sendEmailOtp.isPending : sendOtp.isPending)) ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('sending')}
                        </>
                    ) : (
                        <>
                            {t('continue')}
                            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                        </>
                    )}
                </button>
                <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
                    {t('terms')}{' '}
                    <a href={`/${locale}/terms`} className="text-brand-green font-medium underline">{t('termsOfService')}</a> {t('and')}{' '}
                    <a href={`/${locale}/privacy`} className="text-brand-green font-medium underline">{t('privacyPolicy')}</a>
                </p>

                {/* email-otp-login (run #46): subtle secondary-channel toggle —
                    small, muted, below the legal row; never competes with the
                    primary phone CTA. */}
                <button
                    type="button"
                    onClick={() => {
                        setError(null);
                        setMode((m) => (m === 'phone' ? 'email' : 'phone'));
                    }}
                    className="mt-4 w-full text-center text-xs text-gray-400 underline underline-offset-2 hover:text-brand-green transition-colors"
                >
                    {mode === 'phone' ? t('emailToggle') : t('phoneToggle')}
                </button>

                <DevLoginBar />
            </div>
        </div>
    );
}
