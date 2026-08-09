'use client';

import { useState, useRef, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
    ArrowLeft,
    Share2,
    MessageSquare,
    Calendar,
    MapPin,
    ChevronRight,
    Trophy,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { useMatch } from '@/hooks/useMatches';
import { useJoinMatch, useLeaveMatch } from '@/hooks/useMatchActions';
import { useWalletBalance } from '@/hooks/useWallet';
import { selectUser, useAppStore } from '@/store/useAppStore';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import PaymentSheet from '@/components/payment/PaymentSheet';
import TeamLineup from '@/components/matches/TeamLineup';
import TeamLineupSheet from '@/components/matches/TeamLineupSheet';
import GameDetails from '@/components/matches/GameDetails';
import LocationMap from '@/components/matches/LocationMap';

export default function MatchDetailPage({
    params,
}: {
    params: Promise<{ id: string; locale: string }>;
}) {
    const { id, locale } = use(params);
    const router = useRouter();
    const t = useTranslations();

    // ── Data fetching via React Query ──
    const { data: match, isLoading, error, refetch } = useMatch(id);
    const joinMatch = useJoinMatch();
    const leaveMatch = useLeaveMatch();
    const { data: walletData } = useWalletBalance();
    const walletBalance = Number(walletData?.balance ?? 0);

    // Get current user from Zustand store (populated by auth/dev-login)
    const storeUser = useAppStore(selectUser);
    const currentUserId = storeUser?.id;

    // Derived join state from match data — survives page refresh because
    // GET /matches/:id returns the roster with user IDs.
    const isJoined =
        currentUserId && match
            ? match.roster.some((p) => p.userId === currentUserId)
            : false;
    const isUserHost =
        currentUserId && match ? match.hostId === currentUserId : false;
    const showJoin = !!match && !isJoined && !isUserHost && match.status === 'open';

    const [showPayment, setShowPayment] = useState(false);
    const [showTeamSheet, setShowTeamSheet] = useState(false);

    /* ── Scroll Parallax ─────────────────────────────── */
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollY, setScrollY] = useState(0);

    const handleScroll = useCallback(() => {
        if (scrollRef.current) {
            setScrollY(scrollRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true });
            return () => el.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    // Parallax calculations
    const heroHeight = 288; // h-72 = 18rem = 288px
    const parallaxProgress = Math.min(scrollY / heroHeight, 1);
    const heroOpacity = 1 - parallaxProgress * 0.8;
    const heroScale = 1 + parallaxProgress * 0.15;
    const heroTranslateY = scrollY * 0.4;

    const handleJoinClick = () => {
        setShowPayment(true);
    };

    const handlePaySuccess = () => {
        setShowPayment(false);
        joinMatch.mutate(id);
    };

    const openSpots = match ? match.totalSpots - match.filledSpots : 0;

    return (
        <MobileFrame>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto scroll-container bg-brand-bg relative"
            >
                {/* ══════════════════════════════════════
            Loading State
            ═══════════════════════════════════ */}
                {isLoading && (
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
                    </div>
                )}

                {/* ══════════════════════════════════════
            Error State (API error, no data)
            ═══════════════════════════════════ */}
                {error && !isLoading && !match && (
                    <div className="flex flex-col items-center justify-center py-20 px-8">
                        <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                            <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-lg font-bold text-brand-black mb-1">
                            {t('common.error')}
                        </h3>
                        <p className="text-sm text-gray-400 text-center mb-6">
                            {t('common.errorDescription')}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                )}

                {/* ══════════════════════════════════════
            Main Content — only when match data exists
            ═══════════════════════════════════ */}
                {match && (
                    <>
                {/* ════ HERO SECTION — Stadium Background with Parallax ════ */}
                <div className="relative h-72 overflow-hidden">
                    <div
                        className="absolute inset-0 will-change-transform"
                        style={{
                            transform: `translateY(${heroTranslateY}px) scale(${heroScale})`,
                            opacity: heroOpacity,
                            transition: 'none',
                        }}
                    >
                        <Image
                            src="/images/stadium-bg.png"
                            alt="Match stadium"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />

                    {/* Top Actions */}
                    <div
                        className="absolute top-0 inset-x-0 flex items-center justify-between p-4 pt-safe z-10"
                        style={{ opacity: Math.max(0, 1 - parallaxProgress * 1.5) }}
                    >
                        <button
                            onClick={() => router.back()}
                            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                        >
                            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2} />
                        </button>
                        <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                            {isJoined
                                ? <MessageSquare className="w-5 h-5 text-white" strokeWidth={1.5} />
                                : <Share2 className="w-5 h-5 text-white" strokeWidth={1.5} />
                            }
                        </button>
                    </div>

                    {/* Bottom Text on Hero */}
                    <div
                        className="absolute bottom-0 inset-x-0 p-5 z-10"
                        style={{
                            transform: `translateY(${-scrollY * 0.2}px)`,
                            opacity: Math.max(0, 1 - parallaxProgress * 1.2),
                        }}
                    >
                        {isJoined && (
                            <div className="inline-flex items-center gap-1.5 bg-brand-green/90 backdrop-blur-sm rounded-full px-3 py-1.5 mb-3 animate-scale-in">
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-xs font-bold text-white">{t('matchDetail.joined')}</span>
                            </div>
                        )}
                        <h1 className="text-2xl font-extrabold text-white leading-tight drop-shadow-lg">
                            {match.time} | {match.title} {t('feed.at')} {match.location}
                        </h1>
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <MapPin className="w-3.5 h-3.5 text-green-400" strokeWidth={2} fill="currentColor" />
                            <span className="text-sm text-white/90 font-medium">{match.venueName}</span>
                        </div>
                    </div>
                </div>

                {/* ════ CONTENT AREA ════ */}
                <div className="relative -mt-3 bg-brand-bg rounded-t-3xl min-h-[50vh]">
                    {/* Pull Handle */}
                    <div className="flex justify-center pt-3 pb-2">
                        <div className="w-10 h-1 rounded-full bg-gray-300" />
                    </div>

                    {isJoined ? (
                        /* ═══ JOINED STATE ═══ */
                        <div className="pb-32">
                            {/* 1. Game Details */}
                            <div className="mx-5 mt-2">
                                <GameDetails
                                    date={match.date}
                                    time={match.time}
                                    price={match.price}
                                    hasJoined={true}
                                />
                            </div>

                            {/* View Match Rules */}
                            <div className="flex items-center justify-center gap-2 py-5">
                                <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                <span className="text-sm font-semibold text-brand-black">{t('matchDetail.viewRules')}</span>
                            </div>

                            {/* 2. Location / Map */}
                            <div className="mx-5 bg-white rounded-2xl shadow-card p-5">
                                <LocationMap
                                    venueName={match.venueName}
                                    venueDetails={match.venueDetails || match.location}
                                    location={match.location}
                                />
                            </div>

                            {/* 3. Team Lineup */}
                            <div className="px-5 pt-6">
                                <TeamLineup format={match.format} />
                            </div>

                            {/* Leave Match Button */}
                            {!isUserHost && (
                                <div className="px-5 pt-6">
                                    <button
                                        onClick={() => leaveMatch.mutate(id)}
                                        disabled={leaveMatch.isPending}
                                        className="w-full py-3 rounded-xl border border-brand-red/30 text-brand-red text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                                    >
                                        {leaveMatch.isPending ? '...' : (t('matchDetail.leaveMatch') || 'Leave Match')}
                                    </button>
                                </div>
                            )}

                            {/* Cancel Match Button (Host only) */}
                            {isUserHost && match.status !== 'completed' && match.status !== 'cancelled' && (
                                <div className="px-5 pt-6">
                                    <button
                                        onClick={() => {
                                            if (confirm(t('matchDetail.cancelConfirm') || 'Cancel this match?')) {
                                                // TODO: wire cancel endpoint
                                            }
                                        }}
                                        className="w-full py-3 rounded-xl border border-brand-red/30 text-brand-red text-sm font-semibold active:scale-[0.98] transition-transform"
                                    >
                                        {t('matchDetail.cancelMatch') || 'Cancel Match'}
                                    </button>
                                </div>
                            )}

                            {/* WhatsApp Invite CTA (Sticky at bottom) */}
                            <div className="fixed bottom-20 inset-x-0 max-w-md mx-auto px-5 z-40">
                                <div className="bg-brand-green rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-[0_4px_20px_rgba(37,65,50,0.4)]">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.121.553 4.112 1.52 5.847L.054 23.514l5.826-1.527A11.937 11.937 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.8 0-3.508-.47-5.003-1.29l-.358-.212-3.716.975.991-3.622-.233-.37A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                                        </svg>
                                        <span className="text-sm font-bold text-white">{t('matchDetail.inviteWhatsApp')}</span>
                                    </div>
                                    <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5">
                                        <span className="text-[11px] font-bold text-white">
                                            {openSpots} {t('matchDetail.spotsLeft')} • {t('matchDetail.fillSquad')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ═══ PRE-JOIN STATE ═══ */
                        <div className="pb-32">
                            {/* Organizer */}
                            <div className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                            <span className="text-xs font-bold text-gray-500">
                                                {match.organizer.name.charAt(0)}
                                            </span>
                                        </div>
                                        <div className="absolute -bottom-1 -end-1 bg-brand-green text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                            {match.organizer.rating}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">{t('matchDetail.organizer')}</p>
                                        <p className="text-sm font-bold text-brand-black">{match.organizer.name}</p>
                                    </div>
                                </div>
                                <button className="text-sm font-medium text-brand-green"
                                    onClick={() => router.push(`/${locale}/personal-info`)}>
                                    {t('matchDetail.viewProfile')}
                                </button>
                            </div>

                            {/* Details List */}
                            <div className="px-5 mt-2 space-y-4">
                                <div className="flex items-start gap-3">
                                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" strokeWidth={1.5} />
                                    <div>
                                        <p className="text-sm font-semibold text-brand-black">{match.date}</p>
                                        <p className="text-xs text-gray-500">{match.time} - {match.endTime}</p>
                                    </div>
                                </div>
                                {/* Location */}
                                <LocationMap
                                    venueName={match.venueName}
                                    venueDetails={match.venueDetails || match.location}
                                    location={match.location}
                                />
                            </div>

                            {/* Match Info */}
                            <div className="px-5 mt-5">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                    <p className="text-sm font-bold text-brand-black">{match.intensity} {t('matchDetail.matchType')}</p>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 ms-6">
                                    {match.format} • {match.surface} • {t('matchDetail.matchRules')}
                                </p>
                            </div>

                            {/* Rule Pills */}
                            <div className="flex gap-2.5 px-5 mt-4 overflow-x-auto scroll-container">
                                {[
                                    { label: t('gameDetails.price'), value: match.price === 0 ? t('gameDetails.free') : `${match.price} ${match.currency}` },
                                    { label: t('matchDetail.genderLabel'), value: match.gender === 'men' ? t('matchDetail.gender.men') : match.gender === 'women' ? t('matchDetail.gender.women') : t('matchDetail.gender.mixed') },
                                    { label: t('matchDetail.surface'), value: match.surface },
                                ].map((pill) => (
                                    <div
                                        key={pill.label}
                                        className="bg-white rounded-xl shadow-card px-4 py-2.5 flex-shrink-0"
                                    >
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                            {pill.label}
                                        </p>
                                        <p className="text-sm font-bold text-brand-black mt-0.5">{pill.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Team Section */}
                            <div className="px-5 mt-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-brand-black">{t('matchDetail.team')}</h3>
                                    <span className="text-sm font-semibold text-brand-green">
                                        {match.filledSpots} / {match.totalSpots} {t('matchDetail.attending')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-3">
                                    <div className="flex -space-x-2 rtl:space-x-reverse">
                                        {match.roster.slice(0, 3).map((p) => (
                                            <div
                                                key={p.id}
                                                className="w-9 h-9 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center"
                                            >
                                                <span className="text-[10px] font-bold text-gray-500">
                                                    {p.name.charAt(0)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-xs font-medium text-gray-400">
                                        +{Math.max(0, match.filledSpots - 3)}
                                    </span>
                                    <div className="flex-1" />
                                    <button
                                        onClick={() => setShowTeamSheet(true)}
                                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center"
                                    >
                                        <ChevronRight className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>

                            {/* Latest Discussion */}
                            {match.comments.length > 0 && (
                                <div className="px-5 mt-6">
                                    <h3 className="text-base font-bold text-brand-black">{t('matchDetail.latestDiscussion')}</h3>
                                    <div className="flex items-start gap-3 mt-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-bold text-gray-500">
                                                {match.comments[0].userName.charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm">
                                                <span className="font-semibold text-brand-black">{match.comments[0].userName}</span>
                                                <span className="text-gray-400 text-xs ms-1.5">{t('messages.justNow')}</span>
                                            </p>
                                            <p className="text-sm text-gray-500 mt-0.5">
                                                {match.comments[0].text}
                                            </p>
                                        </div>
                                    </div>
                                    <button className="text-sm font-medium text-brand-green mt-3">
                                        {t('matchDetail.viewAllComments')} {match.comments.length} {t('matchDetail.comments')}
                                    </button>
                                </div>
                            )}

                            {showJoin && (
                            <div className="fixed bottom-20 inset-x-0 max-w-md mx-auto px-5 z-40">
                                <button
                                    onClick={handleJoinClick}
                                    className="
                                        w-full py-4 rounded-2xl bg-brand-green text-white
                                        text-sm font-bold flex items-center justify-between px-6
                                        shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                                        active:scale-[0.98] transition-transform
                                    "
                                >
                                    <span>{t('matchDetail.joinMatch')}</span>
                                    <span className="font-extrabold">{match.price} {match.currency}</span>
                                </button>
                            </div>
                            )}
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>

            <BottomNav />

            {/* Payment Sheet */}
            {match && (
            <PaymentSheet
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                onPaySuccess={handlePaySuccess}
                matchTitle={`${match.format} ${match.intensity}`}
                matchTime={`${match.date}, ${match.time}`}
                matchLocation={match.venueName}
                matchId={match.id}
                price={match.price}
                walletBalance={walletBalance}
            />
            )}

            {/* Team Lineup Sheet (pre-join) */}
            {match && (
            <TeamLineupSheet
                isOpen={showTeamSheet}
                onClose={() => setShowTeamSheet(false)}
                format={match.format}
            />
            )}
        </MobileFrame>
    );
}
