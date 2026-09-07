'use client';

import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
    /** Renders nothing when false (caller's `useOnlineStatus()` result). */
    isOffline: boolean;
    /**
     * Layout idiom: `inline` = the canonical amber strip (mx-4 mt-2, icon row)
     * used by feed/clubs/my-games/messages/reports; `plain` = the compact
     * text-only strip — margins are the CALLER's (used inside padded
     * containers: play feed error fallback, wallet history fallback).
     */
    variant?: 'inline' | 'plain';
    /** Extra classes appended after the variant's own (spacing overrides). */
    className?: string;
}

/**
 * Shared offline banner (P2-52, run #40) — ONE component replaces the
 * copy-pasted amber strips on 7 pages (feed, play, clubs, my-games, wallet,
 * messages, reports). Single i18n key `common.offlineBanner`, single
 * lucide WifiOff idiom, SSR-safe (renders only from client-tracked network
 * state via the caller's `useOnlineStatus()`).
 */
export default function OfflineBanner({
    isOffline,
    variant = 'inline',
    className = '',
}: OfflineBannerProps) {
    const t = useTranslations('common');
    if (!isOffline) return null;
    if (variant === 'plain') {
        return (
            <div role="status" className={`bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 ${className}`}>
                <p className="text-xs text-amber-700 font-medium">{t('offlineBanner')}</p>
            </div>
        );
    }
    return (
        <div
            role="status"
            className={`mx-4 mt-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800 ${className}`}
        >
            <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden />
            <span>{t('offlineBanner')}</span>
        </div>
    );
}
