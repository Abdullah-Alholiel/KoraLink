'use client';

import { useTranslations } from 'next-intl';
import { X, Trophy, Users, Loader2, AlertTriangle } from 'lucide-react';
import { usePublicProfile } from '@/hooks/useUser';
import type { RosterPlayer } from '@/types';

interface PlayerProfileSheetProps {
    player: RosterPlayer | null;
    onClose: () => void;
}

export default function PlayerProfileSheet({ player, onClose }: PlayerProfileSheetProps) {
    const t = useTranslations();
    const { data: profile, isLoading, error } = usePublicProfile(player?.userId ?? '');

    if (!player) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 z-[60] transition-opacity" onClick={onClose} />

            {/* Sheet */}
            <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4">
                <div className="w-full max-w-2xl bg-brand-bg rounded-t-3xl shadow-2xl animate-slide-up max-h-[75vh] overflow-y-auto pb-safe">
                {/* Pull handle */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-3">
                    <h2 className="text-lg font-bold text-brand-black">{t('matchDetail.playerProfile')}</h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                    </button>
                </div>

                <div className="px-5 pb-8 pb-safe">
                    {/* ── Avatar Card ── */}
                    <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
                        <div className="flex flex-col items-center">
                            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                                {player.avatarUrl ? (
                                    <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-bold text-gray-400">{player.name.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <h3 className="text-lg font-bold text-brand-black mt-3">{player.name}</h3>
                            {profile?.handle && <p className="text-xs text-gray-400 mt-0.5" dir="ltr">@{profile.handle}</p>}
                        </div>

                        {/* Badges */}
                        <div className="flex items-center justify-center gap-2 mt-4">
                            {player.isHost && (
                                <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-3 py-1.5 rounded-full flex items-center gap-1">
                                    <Trophy className="w-3 h-3" strokeWidth={2.5} />
                                    {t('matchDetail.organizer')}
                                </span>
                            )}
                            {player.team && (
                                <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ${player.team === 'Home' ? 'bg-gray-100 text-gray-600' : 'bg-brand-black text-white'}`}>
                                    <div className={`w-2 h-2 rounded-full ${player.team === 'Home' ? 'bg-white border border-gray-300' : 'bg-gray-500'}`} />
                                    {player.team === 'Home' ? t('matchDetail.teamWhite') : t('matchDetail.teamDark')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Loading / Error States ── */}
                    {isLoading && (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 text-gray-300 animate-spin" strokeWidth={2} />
                        </div>
                    )}

                    {error && (
                        <div className="flex flex-col items-center py-6 bg-white rounded-2xl shadow-card">
                            <AlertTriangle className="w-6 h-6 text-gray-300 mb-2" strokeWidth={1.5} />
                            <p className="text-xs text-gray-400">{t('common.error')}</p>
                        </div>
                    )}

                    {/* ── Stats Grid ── */}
                    {profile && !isLoading && (
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="bg-white rounded-xl shadow-card p-3 text-center">
                                <Trophy className="w-4 h-4 text-brand-green mx-auto mb-1.5" strokeWidth={2} />
                                <p className="text-base font-extrabold text-brand-black" dir="ltr">{profile.pom_count ?? 0}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{t('profile.pomCount')}</p>
                            </div>
                            <div className="bg-white rounded-xl shadow-card p-3 text-center">
                                <Users className="w-4 h-4 text-gray-400 mx-auto mb-1.5" strokeWidth={2} />
                                <p className="text-base font-extrabold text-brand-black" dir="ltr">{profile.games_played ?? 0}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{t('profile.gamesPlayed')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </>
);
}
