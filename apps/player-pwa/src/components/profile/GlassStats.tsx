'use client';

import { useTranslations } from 'next-intl';
import { Trophy } from 'lucide-react';

interface GlassStatsProps {
    games: number;
    potm: number;
    karma: number;
}

/**
 * Frosted-glass stats bar from the Stadium Night profile hero
 * (sketches/004-profile-redesign V2) — shared so Personal Info's stats
 * read pixel-identical to the Profile screen's (Abdullah, 2026-09-06:
 * "tailor personal information screen… same to profile screen").
 * Must sit on the bg-profile-hero gradient — not standalone.
 */
export default function GlassStats({ games, potm, karma }: GlassStatsProps) {
    const t = useTranslations('profile');
    return (
        <div className="flex overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md">
            <div className="flex-1 py-3.5 text-center">
                <p className="text-xl font-extrabold leading-none tabular-nums" dir="ltr">{games}</p>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    {t('gamesPlayed')}
                </p>
            </div>
            <div className="w-px bg-white/15" />
            <div className="flex-1 py-3.5 text-center">
                <p className="flex items-center justify-center gap-1 text-xl font-extrabold leading-none">
                    <Trophy className="h-4 w-4 text-amber-300" strokeWidth={2} />
                    <span dir="ltr">{potm}</span>
                </p>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    {t('pomCount')}
                </p>
            </div>
            <div className="w-px bg-white/15" />
            <div className="flex-1 py-3.5 text-center">
                <p className="text-xl font-extrabold leading-none tabular-nums" dir="ltr">{karma}</p>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    {t('karma')}
                </p>
            </div>
        </div>
    );
}
