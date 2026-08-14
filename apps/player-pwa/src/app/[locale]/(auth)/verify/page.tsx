'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, Trophy, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVerifyOtp, useSendOtp } from '@/hooks/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { fetcher } from '@/lib/fetcher';
import type { UserProfileApi } from '@/hooks/useUser';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds

function VerifyContent() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations('verify');
    const searchParams = useSearchParams();
    const phone = searchParams?.get('phone') || '';

    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [error, setError] = useState<string | null>(null);
    const [resendCountdown, setResendCountdown] = useState(0);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const verifyOtp = useVerifyOtp();
    const sendOtp = useSendOtp();

    // Resend countdown timer
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    const handleChange = useCallback(
        (index: number, value: string) => {
            if (!/^\d*$/.test(value)) return;
            const newOtp = [...otp];
            newOtp[index] = value.slice(-1);
            setOtp(newOtp);
            if (value && index < OTP_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus();
            }
        },
        [otp],
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
        if (!isComplete || !phone) return;
        setError(null);
        verifyOtp.mutate(
            { phone, otp: otp.join('') },
            {
                onSuccess: async (data) => {
                    if (data.isNewUser) {
                        router.push(`/${locale}/complete-profile`);
                    } else {
                        // Populate Zustand user for returning users — cascade-fixes
                        // join detection, host detection, isAuthenticated, and profile display.
                        try {
                            const profile = await fetcher<UserProfileApi>('/users/me');
                            const skillLevel = (profile.skill_level?.toLowerCase() ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced';
                            useAppStore.getState().login({
                                id: profile.id,
                                fullName: profile.full_name ?? '',
                                handle: profile.handle ?? '',
                                avatarUrl: profile.avatar_url ?? '',
                                phone: profile.phone,
                                preferredLocation: profile.preferred_location ?? '',
                                preferredPosition: profile.preferred_position ?? '',
                                skillLevel,
                                locale: locale as 'ar' | 'en',
                            }, '');
                        } catch (profileErr) {
                            // Profile fetch failed — show error instead of silently navigating
                            // as guest. This usually means the auth cookie didn't set properly.
                            setError(t('verify.profileFetchError'));
                            return;
                        }
                        router.push(`/${locale}/play`);
                    }
                },
                onError: (err) => setError(err.message),
            },
        );
    };

    const handleResend = () => {
        if (resendCountdown > 0 || !phone) return;
        setError(null);
        setResendCountdown(RESEND_COOLDOWN);
        sendOtp.mutate(
            { phone },
            {
                onError: (err) => setError(err.message),
            },
        );
    };

    // Mask phone for display: +966 5X XXX XXXX
    const maskedPhone = phone
        ? `+966 ${phone.slice(0, 1)}X XXX ${phone.slice(-4).padStart(4, 'X')}`
        : '+966 5X XXX XXXX';

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
                    {t('subtitle')}
                    <br />
                    <span className="font-medium text-gray-600">{maskedPhone}</span>
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

                {/* Resend */}
                <button
                    onClick={handleResend}
                    disabled={resendCountdown > 0 || sendOtp.isPending}
                    className="flex items-center gap-1.5 mt-6 text-sm text-brand-green font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {sendOtp.isPending ? (
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
                    disabled={!isComplete || verifyOtp.isPending}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${!verifyOtp.isPending && isComplete
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    {verifyOtp.isPending ? (
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
