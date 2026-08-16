'use client';

import { AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import BottomSheet from '@/components/layout/BottomSheet';

interface EmergencyCancelSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    matchTitle: string;
    matchTime: string;
    isPending?: boolean;
}

export default function EmergencyCancelSheet({
    isOpen,
    onClose,
    onConfirm,
    matchTitle,
    matchTime,
    isPending = false,
}: EmergencyCancelSheetProps) {
    const t = useTranslations('emergencyCancel');

    if (!isOpen) return null;

    return (
        <BottomSheet
            open={isOpen}
            onClose={onClose}
            widthClass="max-w-md"
            dismissOnBackdrop={false}
        >
            {/* Pull Handle */}
            <div className="flex justify-center -mt-2 mb-4 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-6 pb-6">
                {/* Emergency Alert Header Icon */}
                <div className="flex justify-center mb-3">
                    <div className="w-14 h-14 rounded-full bg-brand-red/10 border border-brand-red/20 flex items-center justify-center animate-pulse">
                        <ShieldAlert className="w-7 h-7 text-brand-red" strokeWidth={2} />
                    </div>
                </div>

                <h3 className="text-lg font-bold text-center text-brand-black mb-1">
                    {t('title')}
                </h3>
                <p className="text-xs text-center text-brand-red font-semibold mb-4">
                    {t('subtitle')}
                </p>

                {/* Warning details card */}
                <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-4 mb-5 space-y-2">
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <p className="text-xs text-gray-700 leading-relaxed">
                            {t('warning')}
                        </p>
                    </div>
                    <div className="pt-2 border-t border-red-200/60 text-[11px] font-medium text-gray-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-ping" />
                        <span>{t('ticketInfo')}</span>
                    </div>
                </div>

                {/* Target Match info */}
                <div className="bg-gray-50 rounded-xl p-3 mb-6 flex justify-between items-center text-xs">
                    <span className="font-semibold text-brand-black truncate max-w-[200px]">{matchTitle}</span>
                    <span className="text-gray-500 font-medium">{matchTime}</span>
                </div>
            </div>

            {/* Action buttons (fixed) */}
            <div className="px-6 pb-6 space-y-2.5 flex-shrink-0">
                <button
                    onClick={onConfirm}
                    disabled={isPending}
                    className="w-full py-3.5 rounded-2xl bg-brand-red text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(212,73,76,0.3)]"
                >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                    {t('confirm')}
                </button>
                <button
                    onClick={onClose}
                    disabled={isPending}
                    className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                    {t('keep')}
                </button>
            </div>
        </BottomSheet>
    );
}
