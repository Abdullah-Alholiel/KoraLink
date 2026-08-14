'use client';

import { useTranslations } from 'next-intl';
import { X, Clock, Shield, RotateCcw, Footprints, AlertTriangle, Banknote } from 'lucide-react';

interface MatchRulesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const RULES = [
  { icon: Footprints, key: 'standard' },
  { icon: Clock, key: 'duration' },
  { icon: RotateCcw, key: 'substitutions' },
  { icon: Shield, key: 'equipment' },
  { icon: AlertTriangle, key: 'noShow' },
  { icon: Banknote, key: 'refund' },
] as const;

export default function MatchRulesSheet({ isOpen, onClose }: MatchRulesSheetProps) {
  const t = useTranslations();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60]" onClick={onClose} />

      {/* Compact Bottom Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4">
        <div className="w-full max-w-2xl bg-white rounded-t-3xl shadow-2xl animate-slide-up pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-base font-bold text-brand-black">
            {t('matchDetail.viewRules')}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        {/* Compact 2-Column Rules Grid */}
        <div className="px-5 pb-3 grid grid-cols-2 gap-2.5">
          {RULES.map((rule) => {
            const Icon = rule.icon;
            return (
              <div
                key={rule.key}
                className="p-2.5 rounded-2xl bg-gray-50/80 border border-gray-100 flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-brand-green" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-xs font-bold text-brand-black truncate">
                    {t(`matchRules.${rule.key}.title`)}
                  </h3>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
                  {t(`matchRules.${rule.key}.body`)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="px-5 pb-5 pt-1">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-brand-green text-white text-sm font-bold
              shadow-[0_4px_20px_rgba(37,65,50,0.3)] active:scale-[0.98] transition-transform"
          >
            {t('matchRules.gotIt')}
          </button>
        </div>
      </div>
    </div>
  </>
);
}
