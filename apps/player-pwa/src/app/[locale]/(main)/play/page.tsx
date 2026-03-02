'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Search, Plus } from 'lucide-react';
import { Trophy } from 'lucide-react';
import DatePicker from '@/components/matches/DatePicker';
import MatchCard from '@/components/matches/MatchCard';
import { mockMatches } from '@/lib/dummy-data';
import { Loader2 } from 'lucide-react';

export default function PlayPage() {
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';
    const matches = mockMatches;

    return (
        <div className="pb-4">
            {/* ── Top App Bar (inline) ─────────────── */}
            <div className="bg-white">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                            <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2.5} />
                        </div>
                        <span className="text-lg font-bold text-brand-black tracking-tight">
                            KoraLink
                        </span>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                        <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                    </button>
                </div>
                <div className="flex items-center gap-3 px-4 pb-3">
                    <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <span className="text-sm text-gray-400">Where to play?</span>
                    </div>
                    <Link
                        href={`/${locale}/host`}
                        className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0 shadow-sm active:scale-95 transition-transform"
                    >
                        <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </Link>
                </div>
            </div>

            {/* ── Date Picker ─────────────────────────── */}
            <DatePicker />

            {/* ── Match Cards ─────────────────────────── */}
            <div className="mt-1">
                {matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>

            {/* ── Loading More Indicator ───────────────── */}
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span className="text-xs font-medium uppercase tracking-widest">
                    Discovering More
                </span>
            </div>
        </div>
    );
}
