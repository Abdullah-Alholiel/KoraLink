'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Trophy, CheckCircle2, RefreshCw } from 'lucide-react';

const OTP_LENGTH = 6;

export default function VerifyPage() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';
    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
        [otp]
    );

    const handleKeyDown = useCallback(
        (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Backspace' && !otp[index] && index > 0) {
                inputRefs.current[index - 1]?.focus();
            }
        },
        [otp]
    );

    const isComplete = otp.every((d) => d !== '');

    const handleVerify = () => {
        if (isComplete) {
            router.push(`/${locale}/complete-profile`);
        }
    };

    return (
        <div className="flex flex-col min-h-full px-6">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center gap-3 pt-4 pb-4 pt-safe">
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
                    Enter 6-digit code
                </h1>
                <p className="text-sm text-gray-400 mt-2 text-center">
                    We&apos;ve sent a code to
                    <br />
                    <span className="font-medium text-gray-600">+966 5X XXX XXXX</span>
                </p>

                {/* OTP Boxes */}
                <div className="flex gap-2.5 mt-8">
                    {otp.map((digit, idx) => (
                        <input
                            key={idx}
                            ref={(el) => { inputRefs.current[idx] = el; }}
                            type="tel"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleChange(idx, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(idx, e)}
                            className={`
                w-12 h-14 rounded-xl border-2 text-center text-xl font-bold
                outline-none transition-colors bg-white
                ${digit
                                    ? 'border-brand-green text-brand-black'
                                    : 'border-gray-200 text-gray-300'
                                }
                focus:border-brand-green
              `}
                            autoFocus={idx === 0}
                        />
                    ))}
                </div>

                {/* Resend */}
                <button className="flex items-center gap-1.5 mt-6 text-sm text-brand-green font-medium">
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                    Resend code
                </button>
            </div>

            {/* ── Bottom ────────────────────────────── */}
            <div className="pb-8 pb-safe">
                <button
                    onClick={handleVerify}
                    disabled={!isComplete}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${isComplete
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    Verify and Login
                    <CheckCircle2 className="w-4.5 h-4.5" strokeWidth={2} />
                </button>
                <p className="text-center text-xs text-gray-400 mt-4">
                    Need help?{' '}
                    <span className="text-brand-green font-medium underline">Contact Support</span>
                </p>
            </div>
        </div>
    );
}
