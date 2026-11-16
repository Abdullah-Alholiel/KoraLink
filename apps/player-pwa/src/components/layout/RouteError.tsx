'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { classifyError, errorKey } from '@/lib/error-classify';
import { captureError } from '@/providers/ObservabilityProvider';

/**
 * Shared route-level error state (P2-138). Rendered by segment error.tsx
 * files so a crash stays scoped to its route: heading from `routeError`,
 * the why-line from the classified `errors.*` copy, retry calls reset().
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  useEffect(() => {
    captureError(error, { scope: 'route-error' });
  }, [error]);

  return (
    <div className="min-h-[60dvh] flex items-center justify-center bg-brand-bg p-6">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-card p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-brand-black mb-2">
          {t('routeError.title')}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {t(errorKey(classifyError(error)))}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-brand-green text-white rounded-full px-6 py-3 text-sm font-bold active:scale-95 transition-transform"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={2} />
          {t('common.retry')}
        </button>
      </div>
    </div>
  );
}
