'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Clock, MessageSquare, AlertTriangle } from 'lucide-react';
import { useMyMatches } from '@/hooks/useMessages';
import type { MyJoinedMatch } from '@/hooks/useMessages';

const directMessages = [
    {
        id: 'm1',
        name: 'Khalid Al-Faisal',
        avatar: 'K',
        text: 'Are we still on for the match on Friday?',
        time: '2m ago',
        unread: 1,
    },
    {
        id: 'm2',
        name: 'Sarah Johnson',
        avatar: 'S',
        text: 'Great game yesterday! The team played...',
        time: '1h ago',
        unread: 0,
    },
    {
        id: 'm3',
        name: 'Omar Hassan',
        avatar: 'O',
        text: 'Send me the location pin please.',
        time: 'Yesterday',
        unread: 0,
    },
    {
        id: 'm4',
        name: 'Team Support',
        avatar: '🎧',
        isSystem: true,
        text: 'Your booking #4492 has been confirmed.',
        time: '2d ago',
        unread: 0,
    },
];

function formatMatchTime(scheduledAt: string) {
    const d = new Date(scheduledAt);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Tonight, ${time}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
    const t = useTranslations();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';

    // ── Active Discussions from joined matches (REST) ──
    const {
        data: myMatches,
        isLoading,
        error,
        refetch,
    } = useMyMatches();

    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h1 className="text-2xl font-bold text-brand-black">{t('messages.title')}</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <Search className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Active Discussions ────────────────── */}
            <div className="px-5 pb-2">
                <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('messages.activeDiscussions')}
                </p>

                {/* Loading */}
                {isLoading && (
                    <div className="space-y-3">
                        {[1, 2].map((i) => (
                            <div key={i} className="bg-white rounded-2xl shadow-card p-4 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-gray-200 rounded w-2/3" />
                                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && !isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
                            <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm text-gray-400 text-center mb-4">
                            {t('common.errorDescription')}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                )}

                {/* Empty — no joined matches yet */}
                {!isLoading && !error && myMatches && myMatches.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <MessageSquare className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-base font-bold text-brand-black mb-1">
                            {t('messages.noMessages')}
                        </h3>
                        <p className="text-sm text-gray-400 text-center">
                            {t('messages.noMessagesDescription')}
                        </p>
                    </div>
                )}

                {/* Populated — joined match discussion cards */}
                {!isLoading && !error && myMatches && myMatches.length > 0 && (
                    <div className="space-y-3">
                        {myMatches.map((match: MyJoinedMatch) => (
                            <div key={match.id} className="bg-white rounded-2xl shadow-card p-4 animate-fade-in-up">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-brand-black flex-1 min-w-0 truncate">
                                        {match.venue_name || match.title}
                                    </h3>
                                    <span
                                        className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ms-2 flex-shrink-0 ${
                                            match.status === 'Open'
                                                ? 'bg-brand-green/10 text-brand-green'
                                                : match.status === 'Full'
                                                  ? 'bg-gray-200 text-gray-600'
                                                  : 'bg-gray-100 text-gray-500'
                                        }`}
                                    >
                                        {match.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 mt-1.5">
                                    <Clock className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                                    <span className="text-xs text-gray-500">
                                        {formatMatchTime(match.scheduled_at)}
                                    </span>
                                    <span className="text-xs text-gray-300">•</span>
                                    <span className="text-xs text-gray-500">
                                        {match.spots_filled}/{match.max_players}
                                    </span>
                                </div>
                                <Link
                                    href={`/${locale}/match/${match.id}`}
                                    className="mt-3 inline-flex items-center gap-1.5 bg-brand-green/10 text-brand-green text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-transform"
                                >
                                    {t('messages.joinChat')}
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Direct Messages ────────────────────── */}
            <div className="px-5 pt-4">
                <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('messages.directMessages')}
                </p>
                <div className="space-y-4">
                    {directMessages.map((dm) => (
                        <div key={dm.id} className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-bold text-gray-500">{dm.avatar}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-brand-black truncate">
                                        {dm.name}
                                    </p>
                                    <span className="text-[10px] text-gray-400 flex-shrink-0 ms-2">
                                        {dm.time}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 truncate mt-0.5">{dm.text}</p>
                            </div>
                            {dm.unread > 0 && (
                                <span className="w-4.5 h-4.5 min-w-4 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 px-1">
                                    {dm.unread}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
