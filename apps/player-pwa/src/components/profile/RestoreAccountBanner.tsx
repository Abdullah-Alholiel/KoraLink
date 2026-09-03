'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, X } from 'lucide-react';
import { useRestoreAccount } from '@/hooks/useUser';

interface RestoreAccountBannerProps {
    /** ISO date string for the scheduled hard-purge. */
    purgeAt: string;
    onRestored: () => void;
    onDismissed: () => void;
}

/**
 * P0-6 (run #29): persistent "account scheduled for deletion" banner.
 * Rendered at the TOP of the profile page when the user has a saved
 * `koralink_pdpl_purge_at` in localStorage. The banner shows the
 * remaining days + a one-tap Restore action. Dismissing the banner
 * hides it for the current session only (the next page load re-shows
 * it — the data isn't cleared, just the in-memory dismissed flag).
 *
 * The banner is independent of the auth state: it lives above the
 * profile content, so it shows even if Zustand thinks the user is
 * unauthenticated (after a token expiry, the user can still see and
 * tap Restore).
 */
export default function RestoreAccountBanner({ purgeAt, onRestored, onDismissed }: RestoreAccountBannerProps) {
    const t = useTranslations();
    const restore = useRestoreAccount();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const daysLeft = Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));
    const errorMsg = restore.error?.message ?? null;

    const handleRestore = async () => {
        try {
            await restore.mutateAsync();
            onRestored();
        } catch {
            // The mutation error is rendered below the action buttons.
        }
    };

    return (
        <div
            role="alert"
            className="bg-amber-50 border-b border-amber-200 px-4 py-3"
        >
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">
                        {t('profile.restoreAccount.title')}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                        {t('profile.restoreAccount.body', { days: daysLeft })}
                    </p>
                    {errorMsg && (
                        <p className="text-xs text-brand-red mt-2">
                            {errorMsg}
                        </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            onClick={handleRestore}
                            disabled={restore.isPending}
                            className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                        >
                            {restore.isPending ? (
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : null}
                            {t('profile.restoreAccount.restore')}
                        </button>
                        <button
                            onClick={() => {
                                setDismissed(true);
                                onDismissed();
                            }}
                            disabled={restore.isPending}
                            className="px-4 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-semibold"
                            aria-label={t('common.dismiss')}
                        >
                            <X className="w-3 h-3 inline-block me-1" />
                            {t('profile.restoreAccount.dismiss')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
