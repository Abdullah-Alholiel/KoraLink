'use client';

// Offline fallback screen (SW navigation fallback). P2-70 (run #56): the copy
// routes through the shared locale dicts (common.noInternet /
// noInternetDescription / retryConnection) instead of a hardcoded ar/en map —
// translators own the strings, and the i18n parity check covers them. Dates
// are not used here; the Retry control's accessible name is its visible
// localized label (aria = text, the simplest a11y-correct form).

import { useTranslations } from 'next-intl';

export default function Offline() {
  const t = useTranslations('common');

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
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand-green px-8 py-3 font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
      >
        {t('retryConnection')}
      </button>
    </div>
  );
}
