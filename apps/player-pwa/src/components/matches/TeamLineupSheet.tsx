'use client';

import { X } from 'lucide-react';
import TeamLineup from './TeamLineup';

interface TeamLineupSheetProps {
    isOpen: boolean;
    onClose: () => void;
    format: string;
}

export default function TeamLineupSheet({ isOpen, onClose, format }: TeamLineupSheetProps) {
    if (!isOpen) return null;

    return (
        <>
            {/* ── Backdrop ──────────────────────────── */}
            <div
                className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
                onClick={onClose}
            />

            {/* ── Bottom Sheet ─────────────────────── */}
            <div className="
                fixed bottom-0 inset-x-0 z-[70]
                bg-brand-bg rounded-t-3xl
                max-w-md mx-auto
                animate-slide-up
                max-h-[75vh] overflow-y-auto
            ">
                {/* Pull indicator */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-4">
                    <h2 className="text-lg font-bold text-brand-black">Team Lineup</h2>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                        <X className="w-5 h-5 text-gray-400" strokeWidth={2} />
                    </button>
                </div>

                {/* Team Lineup Content */}
                <div className="px-5 pb-8">
                    <TeamLineup format={format} />
                </div>
            </div>
        </>
    );
}
