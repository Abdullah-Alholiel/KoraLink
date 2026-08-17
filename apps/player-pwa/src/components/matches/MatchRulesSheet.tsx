'use client';

import { useTranslations } from 'next-intl';
import { X, Clock, Shield, RotateCcw, Footprints, AlertTriangle, Banknote } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import { usePublicSettings } from '@/hooks/useDisputes';

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
  // Admin-configurable refund policy (Settings → refund_policy). Falls back
  // to the default i18n text when the admin hasn't set one.
  const { data: publicSettings } = usePublicSettings();
  const refundOverride = publicSettings?.refund_policy?.trim() || null;

  if (!isOpen) return null;

  return (
    <BottomSheet open={isOpen} onClose={onClose}>
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
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

      {/* Scrollable 2-column rules grid */}
      <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-3">
        <div className="grid grid-cols-2 gap-2.5">
          {RULES.map((rule) => {
            const Icon = rule.icon;
            const body =
              rule.key === 'refund' && refundOverride
                ? refundOverride
                : t(`matchRules.${rule.key}.body`);
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
                <p className="text-[11px] text-gray-500 leading-snug">
                  {body}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 pb-5 pt-1 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-brand-green text-white text-sm font-bold
            shadow-[0_4px_20px_rgba(37,65,50,0.3)] active:scale-[0.98] transition-transform"
        >
          {t('matchRules.gotIt')}
        </button>
      </div>
    </BottomSheet>
  );
}
