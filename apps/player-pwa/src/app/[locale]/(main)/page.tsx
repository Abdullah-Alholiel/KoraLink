'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Rss, Bell, AlertCircle, WifiOff, Plus } from 'lucide-react';
import { useMatches } from '@/hooks/useMatches';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function CommunityFeedPage() {
    const t = useTranslations('feed');
    const tc = useTranslations('common');
    const { data, isLoading, isError, refetch } = useMatches();
    const isOnline = useOnlineStatus();

    const matches = data?.matches ?? [];

    return (
        <div className="pb-4">
            {/* ── Offline Banner ──────────────────────── */}
            {!isOnline && (
                <div className="mx-4 mt-2 mb-0 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <WifiOff className="w-4 h-4 flex-shrink-0" />
                    <span>{tc('offlineBanner')}</span>
                </div>
            )}

            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h1 className="text-2xl font-bold text-brand-black">{t('title')}</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Loading State ─────────────────────── */}
            {isLoading && (
                <div className="space-y-3 px-4" role="status" aria-label={t('loading')}>
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-card p-4 animate-pulse">
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                                    <div className="h-3 bg-gray-200 rounded w-4/5" />
                                    <div className="h-3 bg-gray-200 rounded w-2/5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Error State ───────────────────────── */}
            {isError && (
                <div className="mx-4 rounded-2xl bg-white shadow-card p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-brand-red mx-auto mb-3" />
                    <h2 className="text-sm font-bold text-brand-black">{t('error')}</h2>
                    <p className="text-sm text-gray-500 mt-1">{t('errorDescription')}</p>
                    <button
                        onClick={() => refetch()}
                        className="mt-4 px-6 py-2 bg-brand-green text-white text-sm font-medium rounded-full hover:bg-brand-green/90 transition-colors"
                    >
                        {t('retry')}
                    </button>
                </div>
            )}

            {/* ── Empty State ──────────────────────── */}
            {!isLoading && !isError && matches.length === 0 && (
                <div className="mx-4 rounded-2xl bg-white shadow-card p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Rss className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-sm font-bold text-brand-black">{t('empty')}</h2>
                    <p className="text-sm text-gray-500 mt-1">{t('emptyDescription')}</p>
                    <Link
                        href="/host"
                        className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 bg-brand-green text-white text-sm font-medium rounded-full hover:bg-brand-green/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {t('hostMatch')}
                    </Link>
                </div>
            )}

            {/* ── Populated: Match Feed Cards ────────── */}
            {!isLoading && !isError && matches.length > 0 && (
                <div className="space-y-3 px-4">
                    {matches.map((match) => {
                        const spotsLeft = match.totalSpots - match.filledSpots;
                        const isUrgent = spotsLeft <= 2 && spotsLeft > 0;
                        const initials = match.organizer.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2);

                        return (
                            <div
                                key={match.id}
                                className={`bg-white rounded-2xl shadow-card p-4 ${isUrgent ? 'border-s-4 border-brand-red' : ''}`}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Avatar */}
                                    <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                        <span className="text-sm font-bold text-gray-500">{initials}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {/* Organizer + time */}
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-brand-black">
                                                {match.organizer.name}
                                            </h3>
                                            <span className="text-xs text-gray-400">
                                                {match.date} • {match.time}
                                            </span>
                                        </div>
                                        {/* Match info */}
                                        <p className="text-sm text-gray-600 mt-1">
                                            <strong>{match.title}</strong>{' '}
                                            <span className="text-gray-400">{t('at')} {match.venueName}</span>
                                        </p>
                                        {/* Spots / format */}
                                        <div className="flex items-center gap-2 mt-2">
                                            <span
                                                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                                    match.status === 'full'
                                                        ? 'bg-gray-100 text-gray-500'
                                                        : isUrgent
                                                          ? 'bg-brand-red/10 text-brand-red'
                                                          : 'bg-brand-green/10 text-brand-green'
                                                }`}
                                            >
                                                {match.status === 'full'
                                                    ? 'FULL'
                                                    : `${spotsLeft} ${t('spotsLeft')}`}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {match.format} • {match.surface}
                                            </span>
                                            {match.price > 0 && (
                                                <span className="text-xs text-gray-400">
                                                    {match.price} {match.currency}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
