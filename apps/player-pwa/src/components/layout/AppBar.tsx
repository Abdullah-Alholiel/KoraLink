'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

interface AppBarProps {
    /** Surface + pinning context (e.g. Play pins it on white inside its sticky group). */
    className?: string;
    /** Use on dark surfaces (Profile hero) — flips the wordmark to white. */
    light?: boolean;
}

/**
 * THE standard app header — one implementation across screens.
 * (Abdullah, 2026-09-06: "make profile screen header same as play screen
 * header… standardise, not to feel various headers in different screens.")
 *
 * Anatomy = the Play screen's proven bar: 32px app icon (the transparent
 * green-footballer mark) + bold wordmark. Carries the notch inset itself
 * (pt-[var(--top-safe-inset)]); callers decide surface + pinning via
 * className. Notification bells live ONLY on the Feed screen — not here
 * (Abdullah, same day: feed owns notifications).
 */
export default function AppBar({ className = '', light = false }: AppBarProps) {
    const t = useTranslations('app');
    return (
        <div className={`flex items-center justify-between px-4 pt-[var(--top-safe-inset)] pb-2 ${className}`}>
            <div className="flex items-center gap-2">
                <Image
                    src="/icons/icon-192x192.png"
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full"
                />
                <span
                    className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-brand-black'}`}
                >
                    {t('title')}
                </span>
            </div>
        </div>
    );
}
