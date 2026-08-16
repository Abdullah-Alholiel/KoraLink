'use client';

import { useEffect } from 'react';
import { captureError } from '@/providers/ObservabilityProvider';

// global-error.tsx replaces the ENTIRE root (including <html>/<body>), so it
// cannot rely on next-intl or the layout. Arabic is the app default locale.
const i18n = {
  heading: 'حدث خطأ ما',
  retry: 'حاول مجدداً',
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      captureError(error, { scope: 'global-error' });
    } catch {
      // Never break the error UI if the reporter itself fails.
    }
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-brand-bg p-8 text-center">
          <h2 className="text-2xl font-bold text-brand-red">{i18n.heading}</h2>
          <button
            onClick={reset}
            className="rounded-lg bg-brand-green px-6 py-2 text-white"
          >
            {i18n.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
