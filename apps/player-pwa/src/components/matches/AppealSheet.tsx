'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldQuestion, X } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

interface AppealSheetProps {
    isOpen: boolean;
    onClose: () => void;
    matchTitle: string;
    isPending: boolean;
    error?: string | null;
    onSubmit: (reason: string) => void;
}

/**
 * Player no-show appeal sheet — submits POST /matches/:id/dispute.
 * On success the match page shows an "under review" banner instead.
 */
export default function AppealSheet({
    isOpen,
    onClose,
    matchTitle,
    isPending,
    error,
    onSubmit,
}: AppealSheetProps) {
    const t = useTranslations('appeal');
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    return (
        <BottomSheet open={isOpen} onClose={onClose} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">{t('title')}</h2>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" aria-label="Close">
                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                        <ShieldQuestion className="w-7 h-7 text-amber-500" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-semibold text-brand-black text-center">{matchTitle}</p>
                    <p className="text-xs text-gray-500 text-center mt-1 leading-relaxed">{t('subtitle')}</p>
                </div>

                <div className="mt-5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                        {t('reasonLabel')}
                    </label>
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 focus-within:border-brand-green transition-colors px-4 py-3">
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            maxLength={1000}
                            placeholder={t('reasonPlaceholder')}
                            className="w-full text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent resize-none"
                        />
                    </div>
                    <div className="flex justify-end mt-1">
                        <span className="text-[10px] text-gray-300" dir="ltr">{reason.length}/1000</span>
                    </div>
                </div>

                {error && (
                    <p className="text-xs text-brand-red mt-2 bg-brand-red/5 rounded-xl px-3 py-2">{error}</p>
                )}
            </div>

            <div className="px-5 pb-8 pt-1 flex-shrink-0">
                <button
                    onClick={() => onSubmit(reason.trim())}
                    disabled={isPending}
                    className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-[0_4px_20px_rgba(37,65,50,0.3)]"
                >
                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('submit')}
                </button>
            </div>
        </BottomSheet>
    );
}
