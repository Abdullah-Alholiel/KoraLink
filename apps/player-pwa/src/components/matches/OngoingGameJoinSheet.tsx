'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, X, Play } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

interface OngoingGameJoinSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    matchTitle: string;
    price: number;
    currency?: string;
}

export default function OngoingGameJoinSheet({
    isOpen,
    onClose,
    onConfirm,
    matchTitle,
    price,
    currency = 'SAR',
}: OngoingGameJoinSheetProps) {
    const t = useTranslations();

    if (!isOpen) return null;

    return (
        <BottomSheet open={isOpen} onClose={onClose} widthClass="max-w-xl" backdropClassName="bg-black/60 backdrop-blur-xs">
            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">{t('matchDetail.ongoingGameTitle')}</h2>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                <div className="flex flex-col items-center pt-2">
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                        <Play className="w-7 h-7 text-amber-700 ms-0.5" strokeWidth={2} />
                    </div>
                    <p className="text-sm font-bold text-brand-black text-center">{matchTitle}</p>
                    <p className="text-xs text-gray-500 mt-1 text-center leading-relaxed">
                        {t('matchDetail.ongoingMatchNotice')}
                    </p>
                </div>

                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-xs text-amber-800 leading-relaxed">
                        {t('matchDetail.ongoingMatchWarning')}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-6 space-y-2.5 flex-shrink-0">
                <button
                    onClick={onConfirm}
                    className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold flex items-center justify-between px-6 shadow-[0_4px_20px_rgba(37,65,50,0.4)] active:scale-[0.98] transition-transform"
                >
                    <span>{t('matchDetail.ongoingGameConfirm')}</span>
                    <span className="font-extrabold">
                        {price === 0 ? t('gameDetails.free') : `${price} ${currency}`}
                    </span>
                </button>
                <button
                    onClick={onClose}
                    className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </BottomSheet>
    );
}
