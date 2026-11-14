'use client';

interface LoadingStateProps {
  /** Localized message (caller picks the key: common.loading, t('loading'), …). */
  message: string;
  /**
   * Extra classes appended (same semantics as EmptyState). NOTE: Tailwind emits
   * `p-*` utilities before `px-*`/`py-*` in its stylesheet, so appended padding
   * classes CANNOT override the built-in px-8 py-10 — pass non-padding classes
   * only, or wrap this component when a different padding is required.
   */
  className?: string;
}

/**
 * Shared loading state (P2-274) — ONE component replaces the copy-pasted
 * inline loading paragraphs whose paddings had drifted (`p-8` vs
 * `px-8 py-10`). Same rationale as EmptyState (run #42): one padding, one
 * tone, plus a subtle dependency-free spinner.
 */
export default function LoadingState({ message, className = '' }: LoadingStateProps) {
  return (
    <div className={`px-8 py-10 text-sm text-gray-400 ${className}`}>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500"
        />
        <span>{message}</span>
      </span>
    </div>
  );
}
