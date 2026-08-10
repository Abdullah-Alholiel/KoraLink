'use client';

import { Users, Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RosterPlayer } from '@/types';

interface TeamLineupProps {
    format: string;
    roster?: RosterPlayer[];
    hostId?: string;
}

/**
 * Dynamic team lineup — renders actual match roster from DB.
 * Players are listed in a single team view with filled/empty slots.
 * Empty slots show the format's total minus filled players.
 */
export default function TeamLineup({ format, roster = [], hostId }: TeamLineupProps) {
    const t = useTranslations();

    // Parse format to get total slots (e.g. '7v7' → 14, '11v11' → 22)
    const playersPerSide = parseInt(format?.split('v')[0] || '7');
    const totalSlots = !isNaN(playersPerSide) ? playersPerSide * 2 : 14;
    const filledSpots = roster.length;
    const openSlots = Math.max(0, totalSlots - filledSpots);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-brand-black">{t('matchDetail.team')}</h2>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                    {format}
                </span>
            </div>

            {/* Unified Team Card */}
            <div className="bg-white rounded-2xl shadow-card p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                    <span className="text-sm font-bold text-brand-black">
                        {filledSpots} / {totalSlots} {t('matchDetail.attending')}
                    </span>
                </div>
                <div className="space-y-2.5">
                    {/* Filled slots from DB roster */}
                    {roster.map((player) => {
                        const isHost = player.userId === hostId || player.id === hostId;
                        return (
                            <div key={player.id} className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 overflow-hidden flex-shrink-0">
                                    {player.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                                    ) : (
                                        player.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <span className="text-xs text-brand-black font-medium flex-1 truncate">
                                    {player.name}
                                </span>
                                {isHost && (
                                    <span className="text-[9px] font-bold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
                                        <Crown className="w-2.5 h-2.5" strokeWidth={2.5} />
                                        {t('matchDetail.organizer')}
                                    </span>
                                )}
                            </div>
                        );
                    })}

                    {/* Empty slots */}
                    {Array.from({ length: openSlots }).slice(0, 12).map((_, i) => (
                        <div key={`empty-${i}`} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 flex-shrink-0">
                                <Users className="w-3 h-3" strokeWidth={1.5} />
                            </div>
                            <span className="text-xs text-gray-300">Open</span>
                        </div>
                    ))}

                    {/* Show "+N more" if many open slots */}
                    {openSlots > 12 && (
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 flex-shrink-0">
                                <Users className="w-3 h-3" strokeWidth={1.5} />
                            </div>
                            <span className="text-xs text-gray-400">+{openSlots - 12} {t('matchDetail.spotsLeft')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
