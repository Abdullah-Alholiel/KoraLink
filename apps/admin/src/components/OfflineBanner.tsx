'use client';

import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/use-online';

/**
 * Console-wide offline banner (run #42; Reviewer A IMPORTANT — the offline
 * UX state was the one missing state across all admin list surfaces).
 *
 * Mirrors the PWA OfflineBanner idiom (P2-52, run #40): amber strip, WifiOff
 * icon, role="status", SSR-safe (renders only from client-tracked network
 * state). Mounted ONCE in the (dashboard) layout so every HQ + partner route
 * gets it without per-page wiring.
 */
export default function OfflineBanner() {
  const t = useTranslations('common');
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-8 py-2.5 text-sm text-amber-800"
    >
      <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden />
      <span className="font-medium">{t('offlineBanner')}</span>
    </div>
  );
}
