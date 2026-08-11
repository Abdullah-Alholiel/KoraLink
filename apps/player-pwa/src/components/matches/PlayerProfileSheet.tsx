'use client';

import { useTranslations } from 'next-intl';
import { X, Trophy, Star, Users } from 'lucide-react';
import type { RosterPlayer } from '@/types';

interface PlayerProfileSheetProps {
    player: RosterPlayer | null;
    onClose: () => void;
}

/**
 * Bottom sheet showing a player's profile when clicked from the team lineup.
 * Shows avatar, name, rating, team badge, and host badge.
 */
export default function PlayerProfileSheet({ player, onClose }: PlayerProfileSheetProps) {
    const t = useTranslations();

    if (!player) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

            {/* Sheet */}
            <div className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl max-w-md mx-auto animate-slide-up max-h-[70vh] overflow-y-auto">
                {/* Pull handle */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Close button */}
                <div className="flex items-center justify-between px-5 pb-3">
                    <h2 className="text-base font-bold text-brand-black">{t('matchDetail.playerProfile')}</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                        <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                    </button>
                </div>

                {/* Player card */}
                <div className="px-5 pb-8">
                    {/* Avatar + Name */}
                    <div className="flex flex-col items-center pt-2 pb-5">
                        <div className="w-20 h-20 rounded-full bg-gray-200 border-4 border-white shadow-sm flex items-center justify-center overflow-hidden">
                            {player.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl font-bold text-gray-400">
                                    {player.name.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-brand-black mt-3">{player.name}</h3>
                    </div>

                    {/* Info badges */}
                    <div className="flex items-center justify-center gap-2 mb-5">
                        {player.isHost && (
                            <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-3 py-1.5 rounded-full flex items-center gap-1">
                                <Trophy className="w-3 h-3" strokeWidth={2.5} />
                                {t('matchDetail.organizer')}
                            </span>
                        )}
                        {player.team && (
                            <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ${
                                player.team === 'Home'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-brand-black text-white'
                            }`}>
                                <div className={`w-2 h-2 rounded-full ${player.team === 'Home' ? 'bg-white border border-gray-300' : 'bg-gray-500'}`} />
                                {player.team === 'Home' ? t('matchDetail.teamWhite') : t('matchDetail.teamDark')}
                            </span>
                        )}
                    </div>

                    {/* Stats placeholder — future: fetch from API */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500 mx-auto mb-1" strokeWidth={2} />
                            <p className="text-sm font-bold text-brand-black">—</p>
                            <p className="text-[10px] text-gray-400">{t('profile.rating')}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <Trophy className="w-4 h-4 text-brand-green mx-auto mb-1" strokeWidth={2} />
                            <p className="text-sm font-bold text-brand-black">—</p>
                            <p className="text-[10px] text-gray-400">{t('profile.pomCount')}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" strokeWidth={2} />
                            <p className="text-sm font-bold text-brand-black">—</p>
                            <p className="text-[10px] text-gray-400">{t('profile.gamesPlayed')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
