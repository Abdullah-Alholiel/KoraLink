'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import TeamLineup from './TeamLineup';
import BottomSheet from '@/components/layout/BottomSheet';
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
        <BottomSheet open={isOpen} onClose={onClose} maxHeightClass="max-h-[85dvh]" panelClassName="bg-brand-bg">
            {/* Pull indicator */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 flex-shrink-0">
                <h2 className="text-lg font-bold text-brand-black">{t('team')}</h2>
                <button
                    onClick={onClose}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                </button>
            </div>

            {/* Scrollable lineup */}
            <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-8">
                <TeamLineup format={format} roster={roster} hostId={hostId} onPlayerClick={onPlayerClick} />
            </div>
        </BottomSheet>
    );
}
