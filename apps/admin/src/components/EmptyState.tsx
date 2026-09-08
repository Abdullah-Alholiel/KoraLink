'use client';

interface EmptyStateProps {
  /** Localized message (caller picks the key: common.noData, t('empty'), …). */
  message: string;
  /** Extra classes appended (padding overrides). */
  className?: string;
}

/**
 * Shared empty-list state (run #42, P2-55) — ONE component replaces the
 * copy-pasted `px-8 py-10 text-sm text-gray-400` paragraphs whose paddings
 * and copy keys had drifted across list pages. Rendered inside DataTable's
 * `empty` slot.
 */
export default function EmptyState({ message, className = '' }: EmptyStateProps) {
  return (
    <div className={`px-8 py-10 text-sm text-gray-400 ${className}`}>{message}</div>
  );
}
