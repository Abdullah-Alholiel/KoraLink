'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MapPin, Users as UsersIcon, Star } from 'lucide-react';
import type { Match } from '@/types';

interface MatchCardProps {
    match: Match;
    /** The authenticated user's ID. If not provided, card shows default "Join" state. */
    currentUserId?: string;
}

export default function MatchCard({ match, currentUserId }: MatchCardProps) {
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations();

    const spotsLeft = match.totalSpots - match.filledSpots;
    const isClosing = match.status === 'closing_soon' || (spotsLeft <= 2 && spotsLeft > 0);
    const isFull = match.status === 'full' || spotsLeft <= 0;

    // ── State-aware button logic ──
    const isCompleted = ['completed', 'cancelled'].includes(match.status);
    const isHost = match.isUserHost ?? (currentUserId ? match.hostId === currentUserId : false);
    const isJoined = match.isJoined ?? match.roster.some(p => p.userId === currentUserId);

    let buttonLabel: string;
    let buttonStyle: string;
    let badge: React.ReactNode = null;

    if (isCompleted) {
        buttonLabel = t('matchDetail.viewDetails');
        buttonStyle = 'bg-gray-100 text-gray-600';
    } else if (isHost) {
        buttonLabel = t('matchDetail.yourMatch');
        buttonStyle = 'bg-amber-100 text-amber-800 border border-amber-300';
        badge = (
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                👑 {t('matchDetail.yourMatch')}
            </span>
        );
    } else if (isJoined) {
        buttonLabel = t('matchDetail.view');
        buttonStyle = 'bg-brand-green/10 text-brand-green border border-brand-green';
        badge = (
            <span className="inline-flex items-center gap-1 bg-brand-green/10 text-brand-green text-[10px] font-bold px-2 py-0.5 rounded-full">
                ✓ {t('matchDetail.joined')}
            </span>
        );
    } else if (isFull) {
        buttonLabel = t('matchCard.full');
        buttonStyle = 'bg-gray-100 text-gray-500';
    } else {
        buttonLabel = t('matchDetail.joinMatch');
        buttonStyle = 'bg-brand-green text-white';
    }

    // ── Gender/type quick badges ──
    const genderShort: Record<string, string> = {
        men: '👥', women: '♀️', mixed: '⚧',
    };

    // ── Roster preview avatars (up to 4) ──
    const rosterPreview = match.roster.slice(0, 4);

    return (
        <Link
            href={`/${locale}/match/${match.id}`}
            className="block bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 transition-shadow hover:shadow-card-hover active:scale-[0.99]"
        >
            {/* ── Header Row: avatar + title + time ──── */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-500">
                            {match.organizer.name.charAt(0)}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-brand-black leading-tight truncate">
                            {match.title}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">{match.organizer.name}</span>
                            <span className="text-xs text-gray-300">•</span>
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" strokeWidth={1} />
                            <span className="text-xs font-medium text-gray-600">
                                {match.organizer.rating > 0 ? match.organizer.rating.toFixed(1) : '—'}
                            </span>
                            {badge && <span className="ms-1">{badge}</span>}
                        </div>
                    </div>
                </div>

                <div className="text-end flex-shrink-0 ms-3">
                    <p className="text-sm font-bold text-brand-black">{match.time}</p>
                    {isClosing && !isFull && (
                        <p className="text-[10px] font-bold text-brand-red uppercase tracking-wide mt-0.5">
                            {spotsLeft <= 1
                                ? `${spotsLeft} ${t('matchCard.spotLeft')}`
                                : t('matchCard.closingSoon')}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Info Pills Row ─────────────────── */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 rounded-full px-2 py-1">
                    <MapPin className="w-3 h-3" strokeWidth={1.5} />
                    {match.location}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 rounded-full px-2 py-1">
                    <UsersIcon className="w-3 h-3" strokeWidth={1.5} />
                    {match.format}
                </span>
                {match.surface && (
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-50 rounded-full px-2 py-1">
                        {match.surface}
                    </span>
                )}
                <span className="text-[10px] font-medium text-gray-500 bg-gray-50 rounded-full px-2 py-1">
                    {genderShort[match.gender] ?? ''} {t(`matchDetail.gender.${match.gender}`)}
                </span>
                <span className={`text-[10px] font-medium rounded-full px-2 py-1 ${
                    match.intensity === 'Competitive'
                        ? 'bg-brand-red/10 text-brand-red'
                        : 'bg-brand-green/10 text-brand-green'
                }`}>
                    {match.intensity === 'Competitive' ? '🏆' : '⚽'} {match.intensity}
                </span>
            </div>

            {/* ── Footer Row: Price + Spots + Button── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">{t('matchCard.price')}</p>
                        <p className="text-xl font-extrabold text-brand-black leading-none">
                            {match.price === 0 ? t('gameDetails.free') : `${match.price} ${match.currency}`}
                        </p>
                    </div>
                    {/* Roster preview avatars */}
                    {rosterPreview.length > 0 && (
                        <div className="flex -space-x-2 ms-2">
                            {rosterPreview.map((p) => (
                                <div key={p.id} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[9px] font-bold text-gray-500">
                                    {p.name.charAt(0)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        {match.filledSpots}/{match.totalSpots}
                    </span>
                    <span className={`text-sm font-semibold px-5 py-2.5 rounded-full ${buttonStyle}`}>
                        {buttonLabel}
                    </span>
                </div>
            </div>
        </Link>
    );
}
