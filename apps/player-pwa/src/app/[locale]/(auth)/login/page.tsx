'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trophy, Loader2, AlertCircle, Mail, Smartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSendOtp, useSendEmailOtp } from '@/hooks/useAuth';
import { useTurnstileEnabled } from '@/hooks/useTurnstileEnabled';
import { Turnstile } from '@/components/auth/Turnstile';
import DevLoginBar from '@/components/auth/DevLoginBar';
import LanguageToggle from '@/components/common/LanguageToggle';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { useRestoreAccount } from '@/hooks/useUser';
import { classifyError } from '@/lib/error-classify';
import { getAuthChannel, setAuthChannel, getAuthEmailDraft, setAuthEmailDraft, getAuthPhoneDraft, setAuthPhoneDraft, type AuthChannel } from '@/lib/auth-flow';


export default function LoginPage() {
    const router = useRouter();
    // P2-386 (run #218): locale from next-intl (middleware default is 'ar';
    // a pathname-split fallback to 'en' desynced redirects from the UI).
    const locale = useLocale();
    const t = useTranslations('login');
    const tErrors = useTranslations('errors');
    // P2-386: offline UX state — banner + OTP-send gated until reconnect.
    const isOnline = useOnlineStatus();
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);
    // Tracks whether the current inline error is the offline gate notice, so
    // reconnecting clears it without touching classified auth errors.
    const [offlineBlocked, setOfflineBlocked] = useState(false);
    useEffect(() => {
        if (isOnline && offlineBlocked) {
            setOfflineBlocked(false);
            setError(null);
        }
    }, [isOnline, offlineBlocked]);
    // 2026-11-16 P0: when SMS is unavailable, the error carries a one-tap
    // "switch to email" action rendered right under the message.
    const [errorAction, setErrorAction] = useState<'switchEmail' | null>(null);

    // email-otp-login (run #46): phone-first by default; a subtle toggle
    // swaps the input to email. Both channels share the verify screen.
    // 2026-09-11: channel + email draft persist in sessionStorage
    // (lib/auth-flow) — a reload (language toggle, SW activation) or a
    // round-trip to the verify screen used to reset the user to phone mode
    // with an empty form. Storage is hydrated in an effect (SSR-safe).
    const [mode, setMode] = useState<AuthChannel>('phone');
    const [email, setEmail] = useState('');
    useEffect(() => {
        const storedChannel = getAuthChannel();
        if (storedChannel !== mode) setMode(storedChannel);
        const draft = getAuthEmailDraft();
        if (draft && !email) setEmail(draft);
        const phoneDraft = getAuthPhoneDraft();
        if (phoneDraft && !phone) setPhone(phoneDraft);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendOtp = useSendOtp();
    const sendEmailOtp = useSendEmailOtp();

    // ── F1 (launch lane, run #212): Cloudflare Turnstile. The widget mounts
    // ONLY when the API advertises it armed via /health; the submit button
    // stays disabled until a fresh token exists (single-use tokens — expired
    // ones reset the state to null via the widget's expired-callback).
    const turnstileStatus = useTurnstileEnabled();
    const turnstileArmed = turnstileStatus?.enabled === true && !!turnstileStatus.siteKey;
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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
        setErrorAction(null);
        setOfflineBlocked(false);
        // P2-386: never fire send-otp offline — the request would fail (or
        // queue) and the user would see a generic send failure. Show the
        // offline notice in the same inline error slot instead.
        if (!isOnline) {
            setError(t('offlineNotice'));
            setOfflineBlocked(true);
            return;
        }
        // F1: armed widget without a fresh token → complete the human check.
        // (The submit button is disabled in this state too; this guard covers
        // programmatic callers and the race between expiry and click.)
        if (turnstileArmed && !turnstileToken) {
            setError(tErrors('captchaRequired'));
            return;
        }
        if (mode === 'email') {
            if (!EMAIL_RE.test(email)) {
                setError(t('invalidEmail'));
                return;
            }
            setSubmitting(true);
            sendEmailOtp.mutate(
                { email: email.trim().toLowerCase(), turnstileToken },
                {
                    onSuccess: () =>
                        router.push(`/${locale}/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`),
                    // P1-47: moderation blocks get their localized copy
                    // (banned/suspended/deleted) instead of a generic send
                    // failure — the user must know WHY they cannot log in.
                    onError: (err) => {
                        const kind = classifyError(err);
                        if (kind === 'captchaRequired' || kind === 'captchaFailed' || kind === 'captchaUnavailable') {
                            // F1: token single-use — a consumed/failed token must
                            // never be replayed; reset so the widget re-issues.
                            setTurnstileToken(null);
                        }
                        setError(
                            kind === 'banned' || kind === 'suspended' || kind === 'deleted'
                                ? tErrors(kind)
                                : kind === 'captchaRequired' ||
                                  kind === 'captchaFailed' ||
                                  kind === 'captchaUnavailable'
                                  ? tErrors(kind)
                                  : tErrors('otpSendFailed'),
                        );
                    },
                    onSettled: () => setSubmitting(false),
                },
            );
            return;
        }
        if (phone.length < 7) return;
        setSubmitting(true);
        sendOtp.mutate(
            { phone, turnstileToken },
            {
                onSuccess: () => router.push(`/${locale}/verify?phone=${phone}`),
                onError: (err) => {
                    const kind = classifyError(err);
                    if (kind === 'captchaRequired' || kind === 'captchaFailed' || kind === 'captchaUnavailable') {
                        setTurnstileToken(null);
                    }
                    if (kind === 'smsUnavailable') {
                        // 2026-11-16 P0: SMS not configured (prod-like) — a
                        // specific, localized message + a ONE-TAP switch to
                        // the email channel rendered with the error.
                        setError(tErrors('smsUnavailable'));
                        setErrorAction('switchEmail');
                        return;
                    }
                    setError(
                        kind === 'banned' || kind === 'suspended' || kind === 'deleted'
                            ? tErrors(kind)
                            : kind === 'captchaRequired' ||
                              kind === 'captchaFailed' ||
                              kind === 'captchaUnavailable'
                              ? tErrors(kind)
                              : tErrors('otpSendFailed'),
                    );
                },
                onSettled: () => setSubmitting(false),
            },
        );
    };

    return (
        <div className="flex flex-col min-h-full px-6">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center gap-3 pt-[var(--top-safe-inset)] pb-4">
                {/* Language toggle (2026-09-17): segmented ع/EN pill replaces the
                    bare globe icon — the choice is visible and pressed-state,
                    not a hidden icon that flips the language on one tap. */}
                <LanguageToggle size="sm" ariaLabel={t('changeLanguage')} />
                <div className="flex items-center gap-2 flex-1 justify-center pe-10">
                    <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center">
                        <Trophy className="w-3.5 h-3.5 text-brand-green" strokeWidth={2.5} />
                    </div>
                    <span className="text-base font-bold text-brand-black">KoraLink</span>
                </div>
            </div>

            {/* ── Content ───────────────────────────── */}
            {/* pointer-events-none: this block's -mt-16 pulls it OVER the
                header row, silently intercepting taps on the header buttons
                (the language toggle never received the click — incident
                2026-09-11). Interactive children re-enable hit-testing. */}
            <div className="flex-1 flex flex-col items-center justify-center -mt-16 pointer-events-none [&_a]:pointer-events-auto [&_input]:pointer-events-auto [&_button]:pointer-events-auto">
                {/* P0-6 (run #30): restore banner when the user soft-deleted
                    on profile and the restore token is still valid. Tap →
                    fetcher falls back to the PDPL restore-token Bearer. */}
                {/* P2-386 (run #218): shared offline strip — the phone/email
                    is not sent until the user is back online. Hidden while a
                    send is in flight (in-progress flow owns the screen). */}
                <OfflineBanner
                    isOffline={!isOnline && !submitting}
                    message={t('offlineNotice')}
                    variant="plain"
                    className="w-full mb-4"
                />
                {restoreAvailable && (
                    <div
                        role="alert"
                        data-testid="restore-account-banner"
                        className="w-full mt-4 mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 pointer-events-auto"
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
                    {mode === 'email' ? (
                        t('titleEmail')
                    ) : (
                        t('title')
                    )}
                </h1>
                <p className="text-sm text-gray-400 mt-3 text-center">
                    {t('subtitleLine1')}
                    <br />
                    {t('subtitleLine2')}
                </p>

                {/* Channel selector (design A — Abdullah's pick, 2026-09-17):
                    segmented Phone/Email pills directly under the title. The
                    alternative-login affordance used to be muted fine-print at
                    the very bottom (Gate 0 F3) — invisible on small phones.
                    Both channels still share the ONE verify screen. */}
                <div
                    role="group"
                    aria-label={t('channelSelector')}
                    data-testid="channel-selector"
                    className="w-full mt-6 flex rounded-full border border-gray-200 bg-white p-1 gap-1"
                >
                    {(['phone', 'email'] as const).map((ch) => {
                        const SegIcon = ch === 'phone' ? Smartphone : Mail;
                        const active = mode === ch;
                        return (
                            <button
                                key={ch}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                    setError(null);
                                    setMode(ch);
                                    setAuthChannel(ch); // survives reloads + verify round-trips
                                }}
                                className={`flex-1 h-11 rounded-full text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                                    active
                                        ? 'bg-brand-green text-white shadow-[0_2px_8px_rgba(37,65,50,0.35)]'
                                        : 'text-gray-500'
                                }`}
                            >
                                <SegIcon className="w-4 h-4" strokeWidth={2} />
                                {ch === 'phone' ? t('channelPhone') : t('channelEmail')}
                            </button>
                        );
                    })}
                </div>

                {/* Phone Input (default channel) */}
                {mode === 'phone' ? (
                <div className="w-full mt-4 flex items-center gap-2 border-2 border-brand-green/30 rounded-2xl px-4 py-3.5 focus-within:border-brand-green transition-colors">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-lg">🇸🇦</span>
                        <span className="text-sm font-medium text-brand-black">+966</span>
                    </div>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '');
                            setPhone(v);
                            setAuthPhoneDraft(v); // survives reloads + back-nav
                        }}
                        placeholder={t('phonePlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        maxLength={9}
                        autoFocus
                    />
                </div>
                ) : (
                /* Email Input (email-otp-login run #46) */
                <div className="w-full mt-4 flex items-center gap-2 border-2 border-brand-green/30 rounded-2xl px-4 py-3.5 focus-within:border-brand-green transition-colors">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <input
                        type="email"
                        dir="ltr"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setAuthEmailDraft(e.target.value); // survives reloads + back-nav
                        }}
                        placeholder={t('emailPlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        autoComplete="email"
                        autoFocus
                    />
                </div>
                )}
                {/* ── F1 (launch lane, run #212): Turnstile widget — mounts
                    ONLY when /health advertises the flag armed + keyed. Sits
                    between the channel input and the bottom section so the
                    consent-scale spacing matches the auth screens. */}
                {turnstileArmed && turnstileStatus?.siteKey && (
                    <Turnstile
                        siteKey={turnstileStatus.siteKey}
                        language={locale === 'ar' ? 'ar' : 'en'}
                        onToken={setTurnstileToken}
                    />
                )}
            </div>

            {/* ── Bottom Section ────────────────────── */}
            <div className="pb-8 pb-safe">
                {/* Error (2026-11-16 P0: SMS-unavailable carries a one-tap
                    "switch to email" action inside the error block). */}
                {error && (
                    <div className="mb-3 flex flex-col items-center gap-2">
                        <p className="text-center text-sm text-brand-red">
                            {error}
                        </p>
                        {errorAction === 'switchEmail' && (
                            <button
                                type="button"
                                data-testid="switch-to-email"
                                onClick={() => {
                                    setError(null);
                                    setErrorAction(null);
                                    setMode('email');
                                    setAuthChannel('email'); // survives reloads + verify round-trips
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-full border border-brand-green/40 text-brand-green text-sm font-semibold active:scale-[0.98] transition-transform"
                            >
                                <Mail className="w-4 h-4" strokeWidth={2} />
                                {t('switchToEmail')}
                            </button>
                        )}
                    </div>
                )}

                <button
                    onClick={handleContinue}
                    disabled={submitting || (mode === 'email' ? sendEmailOtp.isPending : sendOtp.isPending) || (mode === 'email' ? !EMAIL_RE.test(email) : phone.length < 7) || (turnstileArmed && !turnstileToken)}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${!(submitting || (mode === 'email' ? sendEmailOtp.isPending : sendOtp.isPending) || (turnstileArmed && !turnstileToken)) && (mode === 'email' ? EMAIL_RE.test(email) : phone.length >= 7)
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

                <DevLoginBar />
            </div>
        </div>
    );
}
