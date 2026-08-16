'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

interface CancelMatchSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    matchTitle: string;
    matchTime: string;
    isPending?: boolean;
}

export default function CancelMatchSheet({ isOpen, onClose, onConfirm, matchTitle, matchTime, isPending }: CancelMatchSheetProps) {
    const t = useTranslations();

    if (!isOpen) return null;

    return (
        <BottomSheet open={isOpen} onClose={onClose} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">{t('cancelMatch.title')}</h2>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                        <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm text-gray-500 text-center">{matchTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{matchTime}</p>
                </div>

                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-xs text-amber-800 leading-relaxed">{t('cancelMatch.warning')}</p>
                </div>
            </div>

            <div className="px-5 pb-8 space-y-3 flex-shrink-0">
                <button
                    onClick={onConfirm}
                    disabled={isPending}
                    className="w-full py-4 rounded-2xl bg-brand-red text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                    {isPending ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    {t('cancelMatch.confirm')}
                </button>
                <button
                    onClick={onClose}
                    disabled={isPending}
                    className="w-full py-4 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                    {t('cancelMatch.keep')}
                </button>
            </div>
        </BottomSheet>
    );
}
