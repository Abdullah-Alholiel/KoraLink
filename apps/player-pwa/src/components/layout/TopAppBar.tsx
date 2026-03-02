'use client';

import { Bell, Search, Plus } from 'lucide-react';
import { Trophy } from 'lucide-react';

export default function TopAppBar() {
    return (
        <div className="flex-shrink-0 bg-white pt-safe">
            {/* ── Top Row: Logo + Notification ──────────── */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2.5} />
                    </div>
                    <span className="text-lg font-bold text-brand-black tracking-tight">
                        KoraLink
                    </span>
                </div>
                <button
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors"
                    aria-label="Notifications"
                >
                    <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Search Row ────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 pb-3">
                <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <span className="text-sm text-gray-400">Where to play?</span>
                </div>
                <button
                    className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0 shadow-sm"
                    aria-label="Create match"
                >
                    <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}
