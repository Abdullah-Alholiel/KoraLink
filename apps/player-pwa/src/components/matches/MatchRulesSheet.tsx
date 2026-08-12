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
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl max-w-md mx-auto animate-slide-up max-h-[70vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-lg font-bold text-brand-black">
            {t('matchDetail.viewRules')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 pb-8 space-y-1">
          {RULES.map((rule) => {
            const Icon = rule.icon;
            return (
              <div key={rule.key} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-b-0">
                <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-black">
                    {t(`matchRules.${rule.key}.title`)}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {t(`matchRules.${rule.key}.body`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="px-5 pb-8 pt-2">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
              shadow-[0_4px_20px_rgba(37,65,50,0.4)] active:scale-[0.98] transition-transform"
          >
            {t('matchRules.gotIt')}
          </button>
        </div>
      </div>
    </>
  );
}
