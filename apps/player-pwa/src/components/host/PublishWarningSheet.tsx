'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Shield, CircleAlert } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

export interface PublishWarningSheetProps {
    open: boolean;
    mode: 'koralink' | 'self';
    /** i18n key of the classified publish error, or null while publishing/clean. */
    errorKey?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
    isPending: boolean;
}

export default function PublishWarningSheet({
    open, mode, errorKey, onConfirm, onCancel, isPending,
}: PublishWarningSheetProps) {
    const t = useTranslations();

    if (!open) return null;

    const isSelf = mode === 'self';
    const hasError = !!errorKey;

    return (
        <BottomSheet open={open} onClose={onCancel} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                {/* Icon + Title */}
                <div className="flex flex-col items-center mb-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                        isSelf ? 'bg-amber-100' : 'bg-brand-green/10'
                    }`}>
                        {isSelf ? (
                            <AlertTriangle className="w-7 h-7 text-amber-600" strokeWidth={2} />
                        ) : (
                            <Shield className="w-7 h-7 text-brand-green" strokeWidth={2} />
                        )}
                    </div>
                    <h2 className="text-lg font-bold text-brand-black">
                        {t('host.warningTitle')}
                    </h2>
                </div>

                {/* Body text */}
                <div className={`rounded-xl p-4 mb-5 text-sm leading-relaxed ${
                    isSelf
                        ? 'bg-amber-50 border border-amber-200 text-gray-700'
                        : 'bg-brand-green/5 border border-brand-green/20 text-gray-700'
                }`}>
                    {isSelf ? t('host.warningSelfBody') : t('host.warningViaUsBody')}
                </div>

                {/* Contextual publish error — localized, shown at the moment
                    of failure. Confirm re-enables so the user can retry. */}
                {hasError && (
                    <div
                        role="alert"
                        data-testid="publish-error"
                        className="rounded-xl p-4 mb-5 bg-brand-red/5 border border-brand-red/20 flex items-start gap-3"
                    >
                        <CircleAlert className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div className="text-sm text-gray-700 leading-relaxed">
                            <p className="font-bold text-brand-red mb-0.5">{t('host.errorTitle')}</p>
                            <p>{t(errorKey!)}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Buttons */}
            <div className="px-5 pb-6 flex gap-3 flex-shrink-0">
                <button
                    onClick={onCancel}
                    className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600
                        hover:bg-gray-50 active:scale-[0.98] transition-all"
                >
                    {t('host.warningCancel')}
                </button>
                <button
                    onClick={onConfirm}
                    disabled={isPending}
                    className={`flex-1 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all
                        disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed ${
                        isSelf
                            ? 'bg-amber-600 shadow-[0_4px_20px_rgba(217,119,6,0.3)]'
                            : 'bg-brand-green shadow-[0_4px_20px_rgba(37,65,50,0.4)]'
                    }`}
                >
                    {isPending
                        ? t('host.publishing')
                        : isSelf
                            ? t('host.warningConfirmSelf')
                            : t('host.warningConfirmViaUs')
                    }
                </button>
            </div>
        </BottomSheet>
    );
}
