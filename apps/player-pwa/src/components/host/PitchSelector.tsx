'use client';

import { useTranslations } from 'next-intl';
import type { PitchApi } from '@/hooks/useVenues';

export interface PitchSelectorProps {
    pitches: PitchApi[];
    selectedPitch: PitchApi | null;
    onSelect: (pitch: PitchApi) => void;
}

export default function PitchSelector({ pitches, selectedPitch, onSelect }: PitchSelectorProps) {
    const t = useTranslations();

    if (!pitches || pitches.length === 0) return null;

    return (
        <div className="mt-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {t('host.selectPitch')}
            </p>
            {pitches.map((pitch) => (
                <button
                    key={pitch.id}
                    onClick={() => onSelect(pitch)}
                    className={`w-full text-start p-3 rounded-lg border transition-all ${
                        selectedPitch?.id === pitch.id
                            ? 'border-brand-green bg-brand-green/5'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
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
