'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Clock, MapPin, MessageSquare, AlertTriangle, Trophy } from 'lucide-react';
import { useMyMatches } from '@/hooks/useUser';
import { adaptMatchList } from '@/lib/api-adapter';
import type { Match } from '@/types';

// ── Helpers ──

function getDateLabel(date: string, t: (key: string) => string): string {
    const d = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t('messages.today');
    if (diffDays === 1) return t('messages.tomorrow');
    if (diffDays < 7) return t('messages.thisWeek');
    if (diffDays < 14) return t('messages.upcoming');
    return t('messages.past');
}

function groupByDate(matches: Match[], t: (key: string) => string): { label: string; matches: Match[] }[] {
    const groups: Record<string, Match[]> = {};
    const order: string[] = [];

    for (const m of matches) {
        const label = getDateLabel(m.date, t);
        if (!groups[label]) { groups[label] = []; order.push(label); }
        groups[label].push(m);
    }

    // Deduplicate order
    return [...new Set(order)].map(label => ({ label, matches: groups[label] }));
}

// ── Status badge config ──

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    open:   { bg: 'bg-brand-green/10', text: 'text-brand-green', label: 'messages.open' },
    full:   { bg: 'bg-gray-200',       text: 'text-gray-600',   label: 'messages.full' },
    in_progress: { bg: 'bg-amber-100', text: 'text-amber-800',  label: 'messages.live' },
    completed:   { bg: 'bg-gray-100',  text: 'text-gray-400',   label: 'messages.completed' },
    cancelled:   { bg: 'bg-gray-100',  text: 'text-gray-400',   label: 'messages.cancelled' },
};

export default function MessagesPage() {
    const t = useTranslations();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    const { data: matchesApi, isLoading, error, refetch } = useMyMatches();
    const allMatches: Match[] = matchesApi ? adaptMatchList(matchesApi) : [];
    const filtered = searchQuery
        ? allMatches.filter((m) =>
              (m.venueName || m.title).toLowerCase().includes(searchQuery.toLowerCase()) ||
              m.organizer.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : allMatches;

    const groups = groupByDate(filtered, t);

    return (
        <div className="pb-4">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-black">{t('messages.title')}</h1>
                    {filtered.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                            {filtered.length} {t('messages.discussions')}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50"
                >
                    <Search className={`w-5 h-5 ${showSearch ? 'text-brand-green' : 'text-brand-black'}`} strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Search Bar ── */}
            {showSearch && (
                <div className="px-5 pb-3">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <input
                            type="text" value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('common.search')}
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
                            autoFocus
                        />
                    </div>
                </div>
            )}

            {/* ── Loading ── */}
            {isLoading && (
                <div className="px-5 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-card p-4 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-gray-200 flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Error ── */}
            {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
                        <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm text-gray-400 text-center mb-4">{t('common.errorDescription')}</p>
                    <button onClick={() => refetch()} className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform">
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {/* ── Empty ── */}
            {!isLoading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <MessageSquare className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-bold text-brand-black mb-1">{t('messages.noMessages')}</h3>
                    <p className="text-sm text-gray-400 text-center">{t('messages.noMessagesDescription')}</p>
                </div>
            )}

            {/* ── Populated — grouped by date ── */}
            {!isLoading && !error && groups.map((group) => (
                <div key={group.label} className="mb-1">
                    {/* Date header */}
                    <div className="px-5 pt-5 pb-2">
                        <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                            {group.label}
                        </p>
                    </div>

                    <div className="space-y-3">
                        {group.matches.map((match) => {
                            const isCompleted = match.status === 'completed';
                            const isPast = new Date(match.date) < new Date(new Date().toDateString());
                            const isFaded = isCompleted || (isPast && match.status === 'open');
                            const statusConf = STATUS_STYLES[match.status] ?? STATUS_STYLES.open;
                            const initials = (match.venueName || match.title).charAt(0).toUpperCase();

                            return (
                                <Link
                                    key={match.id}
                                    href={`/${locale}/match/${match.id}${!isFaded ? '?chat=open' : ''}`}
                                    className={`block mx-5 bg-white rounded-2xl shadow-card p-4 transition-shadow hover:shadow-card-hover active:scale-[0.99] ${isFaded ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Avatar */}
                                        <div className="w-11 h-11 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                                            {isCompleted ? (
                                                <Trophy className="w-5 h-5 text-brand-green/40" strokeWidth={1.5} />
                                            ) : (
                                                <span className="text-sm font-bold text-brand-green">{initials}</span>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h3 className="text-sm font-bold text-brand-black truncate">
                                                    {match.title || match.venueName}
                                                </h3>
                                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${statusConf.bg} ${statusConf.text}`}>
                                                    {t(statusConf.label)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 mt-1">
                                                <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                                                <span className="text-xs text-gray-500 truncate">
                                                    {match.venueName}{match.location ? ` · ${match.location}` : ''}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 mt-1">
                                                <Clock className="w-3 h-3 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
                                                <span className="text-xs text-gray-400">
                                                    {match.date} · {match.time}
                                                </span>
                                                <span className="text-gray-200">·</span>
                                                <span className="text-xs text-gray-400">
                                                    {match.filledSpots}/{match.totalSpots} spots
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
