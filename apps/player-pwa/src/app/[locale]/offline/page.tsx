'use client';

// Offline fallback screen (SW navigation fallback). P2-70 (run #56): the copy
// routes through the locale dicts — translators own the strings, and the i18n
// parity check covers them.
//
// P2-73 (run #64): when the SW redirects here from a failed navigation it
// saves the original URL (cache KV `koralink-offline-restore`, see
// src/lib/sw-offline-restore.ts). This page reads it and offers a localized
// "back to the page" CTA that re-attempts the original target — turning the
// offline dead-end into a pause, not a loss. If the network is still down on
// CTA press (or right after a fresh redirect while still offline), the user
// gets the localized still-offline toast instead of a silent no-op.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/providers/ObservabilityProvider';
import {
  FRESH_SAVE_MS,
  readRestoreEntry,
  type RestoreEntry,
} from '@/lib/sw-offline-restore';

export default function Offline() {
  // Existing copy lives in `common` (P2-70 contract, pinned by test/offline
  // .test.tsx); the P2-73 restore strings are namespaced under `offline`.
  const t = useTranslations('common');
  const tOffline = useTranslations('offline');
  const showToast = useAppStore((s) => s.showToast);

  // undefined = still reading the KV; null = nothing saved (pure P2-70 screen);
  // entry = offer the restore CTA.
  const [entry, setEntry] = useState<RestoreEntry | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await readRestoreEntry();
      if (cancelled) return;
      setEntry(restored);
      // A fresh save + still-offline = we were JUST redirected here by the
      // SW catch. Say so once (never on stale revisits — those stay silent).
      if (restored && !navigator.onLine && Date.now() - restored.savedAt <= FRESH_SAVE_MS) {
        showToast(tOffline('backUnavailable'), 'error', { detail: tOffline('backUnavailableHint') });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    const stillOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    trackEvent('offline_restore_attempted', { stillOffline });
    if (stillOffline) {
      showToast(tOffline('backUnavailable'), 'error', { detail: tOffline('backUnavailableHint') });
      return;
    }
    if (entry) window.location.assign(entry.url);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand-bg p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
        {/* Wi-Fi off icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M8.11 8.11A10.955 10.955 0 003 12m2.34 4.24A6.97 6.97 0 0112 14m4.24 2.34A6.97 6.97 0 0117.66 12M12 18h.01"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-brand-black">{t('noInternet')}</h1>
        <p className="text-sm text-gray-500">{t('noInternetDescription')}</p>
      </div>
      {entry ? (
        <button
          onClick={handleBack}
          className="rounded-lg bg-brand-green px-8 py-3 font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
        >
          {tOffline('backToPage')}
        </button>
      ) : null}
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand-green px-8 py-3 font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
      >
        {t('retryConnection')}
      </button>
    </div>
  );
}
