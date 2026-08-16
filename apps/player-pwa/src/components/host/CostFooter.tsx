'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

export interface CostFooterProps {
    selectedPitch: boolean;          // has a pitch been selected?
    pitchCostSar: number;
    playerShare: number;
    canPublish: boolean;
    isPending: boolean;
    onPublish: () => void;
}

export default function CostFooter({
    selectedPitch,
    pitchCostSar,
    playerShare,
    canPublish,
    isPending,
    onPublish,
}: CostFooterProps) {
    const t = useTranslations();

    const publishDisabled = isPending || !canPublish;

    return (
        <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 pt-3 pb-5 pb-safe animate-slide-in-bottom">
            {/* Cost row */}
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">{t('host.playerShare')}</span>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-brand-black">SAR {playerShare}</span>
                    <span className="inline-flex items-center gap-1 bg-brand-green/10 text-brand-green text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <Sparkles className="w-3 h-3" strokeWidth={2} />
                        {t('host.hostPlaysFree')}
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400">{t('host.pitchCost')}</span>
                <span className="text-base font-extrabold text-brand-black">
                    SAR {pitchCostSar.toFixed(2)}
                </span>
            </div>

            {/* Publish CTA */}
            <button
                onClick={onPublish}
                disabled={publishDisabled}
                className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                    flex items-center justify-center gap-2
                    shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                    active:scale-[0.98] transition-transform
                    disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
            >
                {isPending ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                        {t('host.publishing')}
                    </>
                ) : (
                    <>
                        {selectedPitch ? t('host.publishMatch') : t('host.selectVenue')}
                        <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                    </>
                )}
            </button>
        </div>
    );
}
