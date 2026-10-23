/**
 * ErrorState — the shared "Error" UX state (UI standards §6.3).
 *
 * Presentational only: the caller passes already-localized `title`,
 * `description` and `retryLabel` (this component never imports i18n; the
 * English `title` default is a last-resort fallback). The retry button
 * renders only when `onRetry` is passed.
 */

import { AlertTriangle } from 'lucide-react';

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
    retryLabel?: string;
}

export default function ErrorState({
    title = 'Something went wrong',
    description,
    onRetry,
    retryLabel,
}: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-8">
            <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
            </div>
            {/* Title-only keeps the original mb-6 gap above the retry button. */}
            <h3 className={`text-lg font-bold text-brand-black ${description ? 'mb-1' : 'mb-6'} text-center`}>
                {title}
            </h3>
            {description && <p className="text-sm text-gray-400 text-center mb-6">{description}</p>}
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                >
                    {retryLabel}
                </button>
            )}
        </div>
    );
}
