'use client';

import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';

interface LeaveMatchSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    matchTitle: string;
    matchTime: string;
    isPending?: boolean;
}

export default function LeaveMatchSheet({ isOpen, onClose, onConfirm, matchTitle, matchTime, isPending }: LeaveMatchSheetProps) {
    const t = useTranslations();

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
            <div className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl max-w-md mx-auto animate-slide-up">
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                <div className="flex items-center justify-between px-5 pb-2">
                    <div className="w-8" />
                    <h2 className="text-lg font-bold text-brand-black">{t('leaveMatch.title')}</h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                    </button>
                </div>

                <div className="flex flex-col items-center px-5 pb-2">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3 text-2xl">🚪</div>
                    <p className="text-sm text-gray-500 text-center">{matchTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{matchTime}</p>
                </div>

                <div className="mx-5 mb-5 bg-gray-50 rounded-xl p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-xs text-gray-500 leading-relaxed">{t('leaveMatch.info')}</p>
                </div>

                <div className="px-5 pb-8 space-y-3">
                    <button
                        onClick={onConfirm}
                        disabled={isPending}
                        className="w-full py-4 rounded-2xl bg-brand-red text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                        {isPending ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : null}
                        {t('leaveMatch.confirm')}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={isPending}
                        className="w-full py-4 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold active:scale-[0.98] transition-transform"
                    >
                        {t('leaveMatch.stay')}
                    </button>
                </div>
            </div>
        </>
    );
}
