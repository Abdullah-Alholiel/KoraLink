'use client';

import { useTranslations } from 'next-intl';
import { Check, UserX, X, Info } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import type { RosterPlayer } from '@/types';

interface AttendanceSheetProps {
    isOpen: boolean;
    onClose: () => void;
    roster: RosterPlayer[];
    currentUserId?: string;
    busyUserId?: string | null;
    onToggle: (player: RosterPlayer) => void;
}

/**
 * Host attendance sheet — mark players as no-show (or clear the mark).
 * Shown for in-progress / completed matches. Toggling calls the
 * /matches/:id/no-show endpoint, which also updates the player's
 * running no-show count (dispute/appeal pipeline entry point).
 */
export default function AttendanceSheet({
    isOpen,
    onClose,
    roster,
    currentUserId,
    busyUserId,
    onToggle,
}: AttendanceSheetProps) {
    const t = useTranslations('attendance');

    if (!isOpen) return null;

    return (
        <BottomSheet open={isOpen} onClose={onClose} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">{t('title')}</h2>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    aria-label="Close"
                >
                    <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
                <div className="mb-4 bg-gray-50 rounded-xl p-3.5 flex items-start gap-3">
                    <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-xs text-gray-500 leading-relaxed">{t('hint')}</p>
                </div>

                <div className="space-y-2">
                    {roster.map((player) => {
                        const busy = busyUserId === player.userId;
                        const isMe = player.userId === currentUserId;
                        return (
                            <button
                                key={player.id}
                                onClick={() => onToggle(player)}
                                disabled={busy}
                                className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-start active:scale-[0.99] transition-all disabled:opacity-60 ${
                                    player.noShow
                                        ? 'bg-red-50/60 border-red-100'
                                        : 'bg-white border-gray-100 shadow-card'
                                }`}
                            >
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${player.noShow ? 'bg-red-100' : 'bg-brand-green/10'}`}>
                                    <span className={`text-xs font-bold ${player.noShow ? 'text-red-600' : 'text-brand-green'}`}>
                                        {player.name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold truncate ${player.noShow ? 'text-red-700' : 'text-brand-black'}`}>
                                        {player.name}
                                        {isMe && <span className="text-[10px] font-bold text-gray-400 ms-1.5">({t('you')})</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                        {player.noShow ? t('markedNoShow') : t('attended')}
                                    </p>
                                </div>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                                    player.noShow
                                        ? 'border-brand-red bg-brand-red'
                                        : 'border-gray-200 bg-white'
                                }`}>
                                    {busy ? (
                                        <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                                    ) : player.noShow ? (
                                        <UserX className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                                    ) : (
                                        <Check className="w-3.5 h-3.5 text-brand-green" strokeWidth={2.5} />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="px-5 pb-8 pt-1 flex-shrink-0">
                <button
                    onClick={onClose}
                    className="w-full py-3.5 rounded-2xl bg-brand-green text-white text-sm font-bold
                        shadow-[0_4px_20px_rgba(37,65,50,0.3)] active:scale-[0.98] transition-transform"
                >
                    {t('done')}
                </button>
            </div>
        </BottomSheet>
    );
}
