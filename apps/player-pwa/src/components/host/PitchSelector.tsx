'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import type { PitchApi } from '@/hooks/useVenues';

export interface PitchSelectorProps {
    pitches: PitchApi[];
    selectedPitch: PitchApi | null;
    onSelect: (pitch: PitchApi) => void;
    /** Called when the user taps "Change" on the collapsed summary card. */
    onClear?: () => void;
}

/**
 * Pitch list → collapses into a locked summary card once a pitch is chosen
 * (US5). The summary keeps size/surface/rate visible and offers a single
 * "Change" action — no way to mismatch format after this point.
 */
export default function PitchSelector({ pitches, selectedPitch, onSelect, onClear }: PitchSelectorProps) {
    const t = useTranslations();

    if (!pitches || pitches.length === 0) return null;

    /* ── Collapsed: pitch chosen → summary card ── */
    if (selectedPitch) {
        return (
            <div className="mt-3 rounded-xl border border-brand-green bg-brand-green/5 p-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-brand-green flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div>
                            <p className="text-[10px] font-bold text-brand-green uppercase tracking-wider">
                                {t('host.pitchSelected')}
                            </p>
                            <p className="text-sm font-bold text-brand-black mt-0.5">
                                {selectedPitch.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {selectedPitch.size} • {selectedPitch.surface_type}
                                {selectedPitch.environment ? ` • ${selectedPitch.environment}` : ''}
                            </p>
                        </div>
                    </div>
                    {onClear && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-xs text-brand-red font-medium active:scale-95 transition-transform"
                        >
                            {t('host.changePitch')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    /* ── Expanded: pitch list ── */
    return (
        <div className="mt-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {t('host.selectPitch')}
            </p>
            {pitches.map((pitch) => (
                <button
                    key={pitch.id}
                    onClick={() => onSelect(pitch)}
                    className="w-full text-start p-3 rounded-lg border transition-all border-gray-200 bg-white hover:border-gray-300"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand-black">
                            {pitch.name}
                        </span>
                        <span className="text-xs text-gray-500">
                            {t('host.pitchRate', { rate: pitch.hourly_rate })}
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {pitch.size} • {pitch.surface_type}
                        {pitch.environment ? ` • ${pitch.environment}` : ''}
                    </p>
                </button>
            ))}
        </div>
    );
}
