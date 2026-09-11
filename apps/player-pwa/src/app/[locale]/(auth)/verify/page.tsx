'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, Trophy, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVerifyOtp, useSendOtp, useVerifyEmailOtp, useSendEmailOtp } from '@/hooks/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { fetcher, setAuthToken } from '@/lib/fetcher';
import { classifyError } from '@/lib/error-classify';
import type { UserProfileApi } from '@/hooks/useUser';

const OTP_LENGTH = 6;
// MUST match the API's resend cooldown (apps/api otp-store.service.ts
// OTP_COOLDOWN_MS = 60s). A shorter client countdown lets the button unlock
// while the server still 429s — the "Resend → Too Many Requests" trap.
const RESEND_COOLDOWN = 60; // seconds — must stay ≥ API OTP_COOLDOWN_MS

/** Arabic-Indic digits (٠-٩) → ASCII, so an Arabic keyboard can fill the boxes. */
function normalizeDigits(value: string): string {
    return value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function VerifyContent() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations('verify');
    const tErrors = useTranslations('errors');
    const searchParams = useSearchParams();
    const phone = searchParams?.get('phone') || '';
    // email-otp-login (run #46): the login screen routes here with either
    // ?phone=… (default) or ?email=… — one shared code-entry screen.
    const email = searchParams?.get('email') || '';
    const channel: 'phone' | 'email' = email ? 'email' : 'phone';

    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [error, setError] = useState<string | null>(null);
    const [resendCountdown, setResendCountdown] = useState(0);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const verifyOtp = useVerifyOtp();
    const sendOtp = useSendOtp();
    const verifyEmailOtp = useVerifyEmailOtp();
    const sendEmailOtp = useSendEmailOtp();

    // Resend countdown timer
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    // Reflect the SERVER's 60s resend cooldown from the moment the page opens.
    // Without this, a user who just sent a code from the login screen can tap
    // Resend immediately — the API (correctly) 429s, and the old UI showed a
    // generic "send failed" that looked like a bug.
    useEffect(() => {
        setResendCountdown(RESEND_COOLDOWN);
    }, []);

    const clearOtp = useCallback(() => {
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = useCallback(
        (index: number, value: string) => {
            const normalized = normalizeDigits(value);
            if (!/^\d*$/.test(normalized)) return;
            const newOtp = [...otp];
            newOtp[index] = normalized.slice(-1);
            setOtp(newOtp);
            if (normalized && index < OTP_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus();
            }
        },
        [otp],
    );

    // Support pasting the full 6-digit code (email clients, password managers,
    // SMS/email copy) — previously only per-box typing worked, and a paste
    // silently dropped all but one digit into a single box.
    const handlePaste = useCallback(
        (e: React.ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            const pasted = normalizeDigits(e.clipboardData.getData('text'));
            const digits = pasted.replace(/\D/g, '').slice(0, OTP_LENGTH);
            if (!digits) return;
            const next = Array(OTP_LENGTH).fill('');
            digits.split('').forEach((d, i) => { next[i] = d; });
            setOtp(next);
            inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
        },
        [],
    );

    const handleKeyDown = useCallback(
        (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Backspace' && !otp[index] && index > 0) {
                inputRefs.current[index - 1]?.focus();
            }
        },
        [otp],
    );

    const isComplete = otp.every((d) => d !== '');

    const handleVerify = () => {
        if (!isComplete) return;
        if (channel === 'phone' && !phone) return;
        setError(null);

        const onSuccess = async (data: { isNewUser: boolean; token?: string }) => {
            // P2-11 exception consumption (email channel): the email verify
            // call opts into responseToken:true because the prod API (render)
            // cannot deliver a working cross-origin cookie to the PWA
            // (vercel). Persist it so the fetcher's existing Bearer path
            // authenticates every subsequent call — the same mechanism
            // dev-login already uses. Phone channel: cookie-only, untouched.
            if (data.token) setAuthToken(data.token);
            if (data.isNewUser) {
                router.push(`/${locale}/complete-profile`);
                return;
            }
            // Populate Zustand user for returning users — cascade-fixes
            // join detection, host detection, isAuthenticated, and profile display.
            try {
                const profile = await fetcher<UserProfileApi>('/users/me');
                useAppStore.getState().login({
                    id: profile.id,
                    fullName: profile.full_name ?? '',
                    handle: profile.handle ?? '',
                    avatarUrl: profile.avatar_url ?? '',
                    phone: profile.phone,
                    preferredLocation: profile.preferred_location ?? '',
                    preferredPosition: profile.preferred_position ?? '',
                    locale: locale as 'ar' | 'en',
                }, '');
            } catch (profileErr) {
                // Profile fetch failed — show error instead of silently navigating
                // as guest. This usually means the auth cookie didn't set properly.
                setError(t('verify.profileFetchError'));
                return;
            }
            router.push(`/${locale}/play`);
        };

        if (channel === 'email') {
            verifyEmailOtp.mutate(
                { email, otp: otp.join('') },
                {
                    onSuccess,
                    onError: (err) => {
                        // 401 = wrong/expired code; 429 = fail-lockout (5 tries).
                        // Stale digits would fail again — clear for a fresh entry.
                        clearOtp();
                        setError(
                            classifyError(err) === 'rateLimited'
                                ? tErrors('rateLimited')
                                : tErrors('otpFailed'),
                        );
                    },
                },
            );
            return;
        }
        verifyOtp.mutate(
            { phone, otp: otp.join('') },
            {
                onSuccess,
                onError: (err) => {
                    clearOtp();
                    setError(
                        classifyError(err) === 'rateLimited'
                            ? tErrors('rateLimited')
                            : tErrors('otpFailed'),
                    );
                },
            },
        );
    };

    const handleResend = () => {
        if (resendCountdown > 0) return;
        if (channel === 'phone' && !phone) return;
        setError(null);
        setResendCountdown(RESEND_COOLDOWN);
        // A resend invalidates the PREVIOUS code server-side (the fresh code
        // overwrites it). Keeping the old digits in the boxes is exactly how
        // users ended up verifying a dead code → 401. Clear them.
        clearOtp();
        if (channel === 'email') {
            sendEmailOtp.mutate(
                { email },
                { onError: () => setError(tErrors('otpSendFailed')) },
            );
            return;
        }
        sendOtp.mutate(
            { phone },
            {
                onError: () => setError(tErrors('otpSendFailed')),
            },
        );
    };

    // Channel-appropriate identifier display. Phone: +966 5X XXX XXXX.
    // Email: local part masked, domain kept (ab****@gmail.com).
    const maskedPhone = phone
        ? `+966 ${phone.slice(0, 1)}X XXX ${phone.slice(-4).padStart(4, 'X')}`
        : '+966 5X XXX XXXX';
    const maskedEmail = email
        ? (() => {
            const [local, domain] = email.split('@');
            const head = local.slice(0, 2);
            return `${head}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
        })()
        : '';

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
            <div className="flex-1 flex flex-col items-center pt-12">
                <h1 className="text-2xl font-bold text-brand-black text-center">
                    {t('title')}
                </h1>
                <p className="text-sm text-gray-400 mt-2 text-center">
                    {channel === 'email' ? t('emailSubtitle') : t('subtitle')}
                    <br />
                    <span className="font-medium text-gray-600" dir={channel === 'email' ? 'ltr' : undefined}>
                        {channel === 'email' ? maskedEmail : maskedPhone}
                    </span>
                </p>

                {/* Error */}
                {error && (
                    <p className="text-sm text-brand-red mt-4 text-center">{error}</p>
                )}

                {/* OTP Boxes */}
                <div className="flex gap-2.5 mt-8">
                    {otp.map((digit, idx) => (
                        <input
                            key={idx}
                            ref={(el) => {
                                inputRefs.current[idx] = el;
                            }}
                            type="tel"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleChange(idx, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(idx, e)}
                            onPaste={handlePaste}
                            disabled={verifyOtp.isPending}
                            className={`
                w-12 h-14 rounded-xl border-2 text-center text-xl font-bold
                outline-none transition-colors bg-white
                ${digit
                                    ? 'border-brand-green text-brand-black'
                                    : 'border-gray-200 text-gray-300'
                                }
                focus:border-brand-green
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
                            autoFocus={idx === 0}
                        />
                    ))}
                </div>

                {/* Resend — pending/spinner keyed to the ACTIVE channel's
                    mutation (sendOtp always exists; email must watch its own). */}
                <button
                    onClick={handleResend}
                    disabled={
                        resendCountdown > 0 ||
                        (channel === 'email' ? sendEmailOtp.isPending : sendOtp.isPending)
                    }
                    className="flex items-center gap-1.5 mt-6 text-sm text-brand-green font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {(channel === 'email' ? sendEmailOtp.isPending : sendOtp.isPending) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                    )}
                    {resendCountdown > 0
                        ? `${t('resendIn')} ${resendCountdown} ${t('seconds')}`
                        : t('resend')}
                </button>
            </div>

            {/* ── Bottom ────────────────────────────── */}
            <div className="pb-8 pb-safe">
                <button
                    onClick={handleVerify}
                    disabled={
                        !isComplete ||
                        verifyOtp.isPending ||
                        verifyEmailOtp.isPending
                    }
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${!(verifyOtp.isPending || verifyEmailOtp.isPending) && isComplete
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    {(verifyOtp.isPending || verifyEmailOtp.isPending) ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('verifying')}
                        </>
                    ) : (
                        <>
                            {t('verify')}
                            <CheckCircle2 className="w-4.5 h-4.5" strokeWidth={2} />
                        </>
                    )}
                </button>
                <p className="text-center text-xs text-gray-400 mt-4">
                    {t('needHelp')}{' '}
                    <span className="text-brand-green font-medium underline">{t('contactSupport')}</span>
                </p>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col min-h-full items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-green" />
                </div>
            }
        >
            <VerifyContent />
        </Suspense>
    );
}
