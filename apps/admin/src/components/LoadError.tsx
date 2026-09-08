'use client';

import { useTranslations } from 'next-intl';

interface LoadErrorProps {
  /** The raw error (message extracted by the caller from the thrown Error). */
  error: string | null;
  /** Retry callback — button hidden when omitted. */
  onRetry?: () => void;
  /** Extra classes appended (spacing overrides). */
  className?: string;
}

/**
 * Standardized load-failure card (run #42; Reviewer B P1 — raw backend text
 * surfaced to admins with no next-action guidance).
 *
 * Error-message standard: WHAT happened (localized title) + WHY (the raw
 * reason, kept visible for ops value but demoted to a muted LTR detail line
 * so 500 internals no longer leak as the headline) + WHAT TO DO (localized
 * hint + Retry button).
 *
 * Shared across every useLiveAdminData consumer — replaces 4 divergent
 * copy-pasted error blocks. All copy from the `common` namespace; callers
 * need no per-page keys.
 */
export default function LoadError({ error, onRetry, className = '' }: LoadErrorProps) {
  const t = useTranslations('common');
  if (!error) return null;

  return (
    <div
      role="status"
      className={`flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-6 py-5 ${className}`}
    >
      <p className="text-sm font-semibold text-red-800">{t('loadErrorTitle')}</p>
      <p dir="ltr" className="max-w-full text-xs break-words text-red-600/80">
        {error}
      </p>
      <p className="text-sm text-red-700">{t('loadErrorHint')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}
