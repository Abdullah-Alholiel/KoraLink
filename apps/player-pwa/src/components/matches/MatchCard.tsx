'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, Users as UsersIcon } from 'lucide-react';
import type { Match } from '@/types';

interface MatchCardProps {
    match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';

    const spotsLeft = match.totalSpots - match.filledSpots;
    const isClosing = match.status === 'closing_soon' || spotsLeft <= 2;

    return (
        <div className="bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 transition-shadow hover:shadow-card-hover">
            {/* ── Header Row: avatar + title + time ──── */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                    {/* Organizer Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-500">
                            {match.organizer.name.charAt(0)}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-brand-black leading-tight">
                            {match.title}
                        </h3>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-gray-500">{match.organizer.handle}</span>
                            <span className="text-xs text-gray-300">•</span>
                            <span className="text-xs text-gray-500">⚡</span>
                            <span className="text-xs font-medium text-gray-600">
                                {match.organizer.rating}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="text-end flex-shrink-0 ms-3">
                    <p className="text-sm font-bold text-brand-black">{match.time}</p>
                    {isClosing && (
                        <p className="text-[10px] font-bold text-brand-red uppercase tracking-wide mt-0.5">
                            {spotsLeft <= 1 ? `${spotsLeft} SPOT LEFT` : 'CLOSING SOON'}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Location + Type Row ────────────────── */}
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
                    <span>{match.location}</span>
                </div>
                <div className="flex items-center gap-1">
                    <UsersIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
                    <span>
                        {match.format} ({match.surface})
                    </span>
                </div>
            </div>

            {/* ── Footer Row: Price + Spots + Button── */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">
                        Price
                    </p>
                    <p className="text-xl font-extrabold text-brand-black leading-none">
                        SAR {match.price}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        {match.filledSpots}/{match.totalSpots} spots
                    </span>
                    <Link
                        href={`/${locale}/match/${match.id}`}
                        className="
              bg-brand-green text-white text-sm font-semibold
              px-5 py-2.5 rounded-full
              transition-all hover:bg-brand-green-light
              active:scale-95
            "
                    >
                        Book Spot
                    </Link>
                </div>
            </div>
        </div>
    );
}
