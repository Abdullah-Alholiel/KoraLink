/**
 * ErrorState — the shared "Error" UX state (UI standards §6.3).
 *
 * Presentational only: the caller passes already-localized `title`,
 * `description` and `retryLabel` (this component never imports i18n).
 * The retry button
 * renders only when both `onRetry` and `retryLabel` are passed.
 */

import { AlertTriangle } from 'lucide-react';

export interface ErrorStateProps {
    /** Already-localized title — REQUIRED so the shared component can never render untranslated copy (PR-Agent run-#159). */
    title: string;
    description?: string;
    onRetry?: () => void;
    /** Already-localized retry label — the retry button renders only when BOTH onRetry and retryLabel are passed. */
    retryLabel?: string;
}

export default function ErrorState({
    title,
    description,
    onRetry,
    retryLabel,
}: ErrorStateProps) {
    return (
        // Live region SCOPED to text-only content (PR-Agent r2, run #160):
        // role="status" sits on the title/description wrapper so SRs announce
        // the state message WITHOUT re-announcing the retry control inside it
        // (the button keeps its own focus announcement). Never embed
        // rapidly-updating copy inside the region.
        <div className="flex flex-col items-center justify-center py-20 px-8">
            <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
            </div>
            <div role="status" className="flex flex-col items-center">
                {/* Title-only keeps the original mb-6 gap above the retry button. */}
                <h3 className={`text-lg font-bold text-brand-black ${description ? 'mb-1' : 'mb-6'} text-center`}>
                    {title}
                </h3>
                {description && <p className="text-sm text-gray-400 text-center mb-6">{description}</p>}
            </div>
            {onRetry && retryLabel && (
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
