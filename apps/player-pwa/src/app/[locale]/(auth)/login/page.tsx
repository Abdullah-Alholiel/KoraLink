'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight, Trophy } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';
    const [phone, setPhone] = useState('');

    const handleContinue = () => {
        if (phone.length >= 7) {
            router.push(`/${locale}/verify`);
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
            <div className="flex-1 flex flex-col items-center justify-center -mt-16">
                <h1 className="text-2xl font-bold text-brand-black text-center leading-tight">
                    Enter your phone
                    <br />
                    number
                </h1>
                <p className="text-sm text-gray-400 mt-3 text-center">
                    We&apos;ll send you a 6-digit code to
                    <br />
                    verify your account.
                </p>

                {/* Phone Input */}
                <div className="w-full mt-8 flex items-center gap-2 border-2 border-brand-green/30 rounded-2xl px-4 py-3.5 focus-within:border-brand-green transition-colors">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-lg">🇸🇦</span>
                        <span className="text-sm font-medium text-brand-black">+966</span>
                        <span className="text-gray-300 text-sm">ˇ</span>
                    </div>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="5X XXX XXXX"
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        maxLength={9}
                        autoFocus
                    />
                </div>
            </div>

            {/* ── Bottom Section ────────────────────── */}
            <div className="pb-8 pb-safe">
                <button
                    onClick={handleContinue}
                    disabled={phone.length < 7}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${phone.length >= 7
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    Continue
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
                    By continuing, you agree to our{' '}
                    <span className="text-brand-green font-medium underline">Terms of Service</span> &{' '}
                    <span className="text-brand-green font-medium underline">Privacy Policy</span>
                </p>
            </div>
        </div>
    );
}
