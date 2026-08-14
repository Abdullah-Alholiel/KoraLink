'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import TeamLineup from './TeamLineup';
import type { RosterPlayer } from '@/types';

interface TeamLineupSheetProps {
    isOpen: boolean;
    onClose: () => void;
    format: string;
    roster?: RosterPlayer[];
    hostId?: string;
    onPlayerClick?: (player: RosterPlayer) => void;
}

export default function TeamLineupSheet({ isOpen, onClose, format, roster = [], hostId, onPlayerClick }: TeamLineupSheetProps) {
    const t = useTranslations('matchDetail');

    if (!isOpen) return null;

    return (
        <>
            {/* ── Backdrop ──────────────────────────── */}
            <div
                className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
                onClick={onClose}
            />

            {/* ── Bottom Sheet ─────────────────────── */}
            <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4">
                <div className="w-full max-w-2xl bg-brand-bg rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto pb-safe">
                    {/* Pull indicator */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-gray-300" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pb-4">
                        <h2 className="text-lg font-bold text-brand-black">{t('team')}</h2>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
                        >
                            <X className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                        </button>
                    </div>

                    {/* Team Lineup Content */}
                    <div className="px-5 pb-8 pb-safe">
                        <TeamLineup format={format} roster={roster} hostId={hostId} onPlayerClick={onPlayerClick} />
                    </div>
                </div>
            </div>
        </>
    );
}
