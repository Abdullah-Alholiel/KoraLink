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
    Trophy,
    AlertTriangle,
    Play,
    CheckCircle2,
    Users,
    Loader2,
    ChevronRight,
    Crown,
    ShieldAlert,
    Lock as LockIcon,
    UserPlus,
} from 'lucide-react';
import { useMatch } from '@/hooks/useMatches';
import { useMarkNoShow } from '@/hooks/useMatches';
import { useAppeal } from '@/hooks/useDisputes';
import { useJoinMatch, useLeaveMatch, useCancelMatch, useStartMatch, useCompleteMatch } from '@/hooks/useMatchActions';
import { useWalletBalance } from '@/hooks/useWallet';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { env } from '@/env.mjs';
import { shareOrCopy } from '@/lib/share';
import { formatClockTime, type AppLocale } from '@/lib/format';
import {
    matchHasStarted,
    matchHasEnded,
    canStartMatch,
    canEndMatch,
    startEarliestAt,
    endEarliestAt,
} from '@/lib/match-timing';
import { trackEvent } from '@/providers/ObservabilityProvider';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import Toast from '@/components/layout/Toast';
import PaymentSheet from '@/components/payment/PaymentSheet';
import TeamLineup from '@/components/matches/TeamLineup';
import MatchRulesSheet from '@/components/matches/MatchRulesSheet';
import CancelMatchSheet from '@/components/matches/CancelMatchSheet';
import EmergencyCancelSheet from '@/components/matches/EmergencyCancelSheet';
import LeaveMatchSheet from '@/components/matches/LeaveMatchSheet';
import ChatSheet from '@/components/matches/ChatSheet';
import GameDetails from '@/components/matches/GameDetails';
import PostMatchSection from '@/components/matches/PostMatchSection';
import PlayerProfileSheet from '@/components/matches/PlayerProfileSheet';
import LocationMap from '@/components/matches/LocationMap';
import OngoingGameJoinSheet from '@/components/matches/OngoingGameJoinSheet';
import AttendanceSheet from '@/components/matches/AttendanceSheet';
import AttendanceBanner from '@/components/matches/AttendanceBanner';
import AppealSheet from '@/components/matches/AppealSheet';
import ReportSheet from '@/components/matches/ReportSheet';

export default function MatchDetailPage({
    params,
}: {
    params: Promise<{ id: string; locale: string }>;
}) {
    const { id, locale } = use(params);
    const router = useRouter();
    const t = useTranslations();

    // ── Data fetching via React Query ──
    const user = useAppStore(selectUser);
    const currentUserId = user?.id;
    const { data: match, isLoading, error, refetch } = useMatch(id, currentUserId);
    const joinMatch = useJoinMatch();
    const leaveMatch = useLeaveMatch();
    const cancelMatch = useCancelMatch();
    const startMatch = useStartMatch();
    const completeMatch = useCompleteMatch();
    const markNoShow = useMarkNoShow(id);
    const appeal = useAppeal(id);
    const { data: walletData } = useWalletBalance();
    const walletBalance = Number(walletData?.balance ?? 0);
    const showToast = useAppStore((s) => s.showToast);

    const openSpots = match ? match.totalSpots - match.filledSpots : 0;
    const isJoined = match?.isJoined ?? false;
    const isUserHost = match?.isUserHost ?? false;
    const showJoin = !!match && !isJoined && !isUserHost && (match.status === 'open' || match.status === 'full' || match.status === 'in_progress') && openSpots > 0;

    const [showPayment, setShowPayment] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [showCancelSheet, setShowCancelSheet] = useState(false);
    const [showEmergencyCancelSheet, setShowEmergencyCancelSheet] = useState(false);
    const [showLeaveSheet, setShowLeaveSheet] = useState(false);
    const [showChatSheet, setShowChatSheet] = useState(false);
    const [showOngoingJoinSheet, setShowOngoingJoinSheet] = useState(false);
    const [showAttendanceSheet, setShowAttendanceSheet] = useState(false);
    const [showAppealSheet, setShowAppealSheet] = useState(false);
    const [showReportSheet, setShowReportSheet] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<import('@/types').RosterPlayer | null>(null);

    // The current user's roster entry (for no-show state + appeals).
    const myRosterEntry = match && currentUserId
        ? match.roster.find((p) => p.userId === currentUserId) ?? null
        : null;

    // Absolute match URL for sharing — computed client-side only (SSR has no
    // window; reading it during render would cause a hydration mismatch).
    const [shareUrl, setShareUrl] = useState('');
    useEffect(() => {
        setShareUrl(window.location.href);
    }, []);

    // Match lifecycle timing — centralized in `lib/match-timing.ts` (single
    // source of truth, mirrored by the API's lifecycle windows).
    const isMatchStarted = match ? matchHasStarted(match) : false;
    const isMatchEnded = match ? matchHasEnded(match) : false;
    const startEarliest = match ? startEarliestAt(match) : null;
    const endEarliest = match ? endEarliestAt(match) : null;
    const canStart = match ? canStartMatch(match) : false;
    const canEnd = match ? canEndMatch(match) : false;

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

    // Auto-open chat sheet when ?chat=open is in the URL
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('chat') === 'open' && isJoined) {
            setShowChatSheet(true);
        }
    }, [isJoined]);

    // Parallax calculations
    const heroHeight = 288; // h-72 = 18rem = 288px
    const parallaxProgress = Math.min(scrollY / heroHeight, 1);
    const heroOpacity = 1 - parallaxProgress * 0.8;
    const heroScale = 1 + parallaxProgress * 0.15;
    const heroTranslateY = scrollY * 0.4;

    const handleJoinClick = () => {
        if (isMatchStarted || match?.status === 'in_progress') {
            setShowOngoingJoinSheet(true);
            return;
        }
        proceedToJoin();
    };

    const proceedToJoin = () => {
        setShowOngoingJoinSheet(false);
        if (match && match.price === 0) {
            joinMatch.mutate(id);
        } else {
            setShowPayment(true);
        }
    };

    const handlePaySuccess = () => {
        setShowPayment(false);
        joinMatch.mutate(id);
    };

    /* ── Universal share / copy (works on HTTP origins + iOS PWA) ──
     * navigator.clipboard is UNDEFINED on non-secure origins (Tailscale IP
     * over HTTP) and gated in installed iOS PWAs — the old `?.writeText`
     * fallbacks silently no-opped while toasting "Link copied".
     * shareOrCopy cascades: Web Share → async clipboard → legacy
     * execCommand, and reports the honest outcome. */
    const handleShareMatch = async (opts?: { text?: string; url?: string; context: string }) => {
        if (!match) return;
        const shareText =
            opts?.text ??
            `⚽ ${match.title}\n${match.date} at ${match.time}\n📍 ${match.venueName}\n💸 ${match.price} ${match.currency}`;
        const url = opts?.url ?? (typeof window !== 'undefined' ? window.location.href : '');

        const outcome = await shareOrCopy({ title: match.title, text: shareText, url });
        trackEvent('match_shared', { match_id: id, context: opts?.context, outcome });
        if (outcome === 'copied') {
            showToast(t('matchDetail.linkCopied'), 'success');
        } else if (outcome === 'failed') {
            showToast(t('matchDetail.copyFailed'), 'error');
        }
        // 'shared' / 'dismissed' — the native sheet already gave feedback.
    };

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
                        className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-[var(--top-safe-inset)] pb-4 z-10"
                        style={{ opacity: Math.max(0, 1 - parallaxProgress * 1.5) }}
                    >
                        <button
                            onClick={() => router.back()}
                            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                        >
                            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2} />
                        </button>
                        <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                            onClick={() => {
                                if (isJoined) {
                                    setShowChatSheet(true);
                                } else {
                                    handleShareMatch({
                                        text: `${match.title} — ${match.date} ${match.time} @ ${match.venueName}`,
                                        context: 'hero',
                                    });
                                }
                            }}>
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
                        {isUserHost ? (
                            <div className="inline-flex items-center gap-1.5 bg-amber-500/90 backdrop-blur-sm rounded-full px-3 py-1.5 mb-3 animate-scale-in border border-amber-300/40">
                                <Crown className="w-3.5 h-3.5 text-amber-200 fill-amber-300" />
                                <span className="text-xs font-bold text-white">{t('matchDetail.hostBadge')}</span>
                            </div>
                        ) : isJoined ? (
                            <div className="inline-flex items-center gap-1.5 bg-brand-green/90 backdrop-blur-sm rounded-full px-3 py-1.5 mb-3 animate-scale-in">
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-xs font-bold text-white">{t('matchDetail.joined')}</span>
                            </div>
                        ) : null}
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

                    {/* Player of the Match — top of page, all states */}
                    <PostMatchSection matchId={match.id} currentUserId={currentUserId} format={match.format} />

                    {/* ════ MATCH STATUS BANNER (all states) ════ */}
                    {match.status === 'cancelled' && (
                        <div className="mx-5 mt-4 bg-brand-red/5 border border-brand-red/20 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-brand-red" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-red">{t('matchDetail.statusCancelled')}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{t('matchDetail.statusCancelledDesc')}</p>
                            </div>
                        </div>
                    )}
                    {match.status === 'completed' && (
                        <div className="mx-5 mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-gray-500" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-700">{t('matchDetail.statusCompleted')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('matchDetail.statusCompletedDesc')}</p>
                            </div>
                        </div>
                    )}
                    {match.status === 'in_progress' && (
                        <div className="mx-5 mt-4 bg-brand-green/5 border border-brand-green/20 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 relative">
                                <div className="w-3 h-3 rounded-full bg-brand-green animate-pulse" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-green flex items-center gap-1.5">
                                    {t('matchDetail.statusInProgress')}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{t('matchDetail.statusInProgressDesc')}</p>
                            </div>
                        </div>
                    )}
                    {match.status === 'full' && !isJoined && !isUserHost && (
                        <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <Users className="w-5 h-5 text-amber-600" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-amber-800">{t('matchDetail.statusFull')}</p>
                                <p className="text-xs text-amber-600 mt-0.5">{t('matchDetail.statusFullDesc')}</p>
                            </div>
                        </div>
                    )}

                    {isJoined ? (
                        /* ═══ JOINED STATE ═══ */
                        <div className="pb-32">
                            {/* 0. Attendance / Appeal banners (host CTA + player no-show states) */}
                            <AttendanceBanner
                                matchId={match.id}
                                isHost={isUserHost}
                                isJoined={isJoined}
                                status={match.status}
                                myRoster={myRosterEntry ? { userId: myRosterEntry.userId, noShow: !!myRosterEntry.noShow } : null}
                                onOpenAttendance={() => setShowAttendanceSheet(true)}
                                onOpenAppeal={() => setShowAppealSheet(true)}
                            />

                            {/* 1. Game Details */}
                            <div className="mx-5 mt-2">
                                <GameDetails
                                    date={match.date}
                                    time={match.time}
                                    price={match.price}
                                    hasJoined={true}
                                    isHost={isUserHost}
                                />
                            </div>

                            {/* 2. Match Rules */}
                            <div className="flex items-center justify-center gap-4 py-4">
                                <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                <button onClick={() => setShowRules(true)} className="text-sm font-semibold text-brand-black">
                                    {t('matchDetail.viewRules')}
                                </button>
                                <span className="text-gray-200">·</span>
                                <button onClick={() => setShowReportSheet(true)} className="text-sm font-semibold text-brand-red">
                                    {t('report.reportMatch')}
                                </button>
                            </div>

                            {/* 3. Team Lineup — who's playing (most important visual) */}
                            <div className="px-5 pt-5">
                                <TeamLineup format={match.format} roster={match.roster} hostId={match.hostId} onPlayerClick={setSelectedPlayer} />
                            </div>

                            {/* 4. Chat / Discussion Preview */}
                            <div className="mx-5 mt-5">
                                <button
                                    onClick={() => setShowChatSheet(true)}
                                    className="w-full bg-white rounded-2xl shadow-card p-4 text-start hover:bg-gray-50/80 active:scale-[0.99] transition-all"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                                            <h3 className="text-sm font-bold text-brand-black">{t('matchDetail.matchChat')}</h3>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-brand-green font-medium">{t('matchDetail.openChat')}</span>
                                            <ChevronRight className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                                        </div>
                                    </div>
                                    {match.comments.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {match.comments.slice(-2).reverse().map((c) => (
                                                <div key={c.id} className="flex items-start gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-brand-green/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <span className="text-[9px] font-bold text-brand-green">
                                                            {c.userName.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-semibold text-gray-700">{c.userName}</span>
                                                        <span className="text-xs text-gray-400 ms-1">{c.text}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-400 mt-1">{t('messages.noMessages')}</p>
                                    )}
                                </button>
                            </div>

                            {/* 5. Location / Map */}
                            <div className="mx-5 mt-5 bg-white rounded-2xl shadow-card p-5">
                                <LocationMap
                                    venueName={match.venueName}
                                    venueDetails={match.venueDetails || match.location}
                                    location={match.location}
                                />
                            </div>

                            {/* Private match banner — invite link is the only way in */}
                            {match.isPrivate && (
                                <div className="mx-5 mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4">
                                    <div className="flex items-start gap-3">
                                        <LockIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-amber-900">
                                                {t('matchDetail.privateBannerTitle')}
                                            </p>
                                            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                                                {t('matchDetail.privateBannerText')}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            handleShareMatch({
                                                text: t('matchDetail.inviteShareText'),
                                                context: 'private-invite',
                                            });
                                        }}
                                        className="mt-3 w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-full py-2.5 text-sm font-bold active:scale-[0.98] transition-transform shadow-[0_4px_16px_rgba(245,158,11,0.35)]"
                                    >
                                        <UserPlus className="w-4 h-4" strokeWidth={2} />
                                        {t('matchDetail.copyInviteLink')}
                                    </button>
                                </div>
                            )}

                            {/* Calendar + Share Actions */}
                            <div className="flex gap-3 mx-5 mt-4">
                                <a
                                    href={`${env.NEXT_PUBLIC_API_URL}/matches/${id}/calendar?format=ics`}
                                    download
                                    className="flex-1 flex items-center justify-center gap-2 bg-white rounded-full shadow-card py-3 text-sm font-semibold text-brand-black hover:bg-gray-50 active:scale-[0.98] transition-all"
                                >
                                    <Calendar className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                                    {t('matchDetail.addToCalendar')}
                                </a>
                                <button
                                    onClick={() => handleShareMatch({ context: 'joined-actions' })}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white rounded-full shadow-card py-3 text-sm font-semibold text-brand-black hover:bg-gray-50 active:scale-[0.98] transition-all"
                                >
                                    <Share2 className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                                    {t('matchDetail.share')}
                                </button>
                            </div>

                            {/* Leave Match Button — only for active (not started/completed/cancelled) matches */}
                            {!isUserHost && (match.status === 'open' || match.status === 'full') && (
                                <div className="px-5 pt-6">
                                    <button
                                        onClick={() => setShowLeaveSheet(true)}
                                        className="w-full py-3 rounded-xl border border-brand-red/30 text-brand-red text-sm font-semibold active:scale-[0.98] transition-transform"
                                    >
                                        {t('matchDetail.leaveMatch')}
                                    </button>
                                </div>
                            )}

                            {/* Host Lifecycle Controls */}
                            {isUserHost && match.status === 'full' && (
                                <div className="px-5 pt-6">
                                    <button
                                        onClick={() => startMatch.mutate(id)}
                                        disabled={!canStart || startMatch.isPending}
                                        className="w-full py-3 rounded-xl bg-brand-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {startMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                        {t('matchDetail.startMatch')}
                                    </button>
                                    {!canStart && startEarliest && (
                                        <p className="text-center text-xs text-gray-400 mt-2">
                                            {t('matchDetail.startAvailableAt', { time: formatClockTime(startEarliest, locale as AppLocale) })}
                                        </p>
                                    )}
                                </div>
                            )}
                            {isUserHost && match.status === 'in_progress' && (
                                <div className="px-5 pt-6">
                                    <button
                                        onClick={() => completeMatch.mutate(id)}
                                        disabled={!canEnd || completeMatch.isPending}
                                        className="w-full py-3 rounded-xl bg-brand-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {completeMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        {t('matchDetail.completeMatch')}
                                    </button>
                                    {!canEnd && endEarliest && (
                                        <p className="text-center text-xs text-gray-400 mt-2">
                                            {t('matchDetail.endAvailableAt', { time: formatClockTime(endEarliest, locale as AppLocale) })}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Cancel Match / Emergency Cancel Button (Host only) */}
                            {isUserHost && match.status !== 'completed' && match.status !== 'cancelled' && (
                                <div className="px-5 pt-6">
                                    {isMatchStarted ? (
                                        <button
                                            onClick={() => setShowEmergencyCancelSheet(true)}
                                            className="w-full py-3.5 rounded-xl bg-brand-red/10 border border-brand-red/40 text-brand-red text-sm font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                                        >
                                            <ShieldAlert className="w-4.5 h-4.5 text-brand-red animate-pulse" strokeWidth={2} />
                                            <span>{t('matchDetail.emergencyCancelMatch')}</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setShowCancelSheet(true)}
                                            className="w-full py-3 rounded-xl border border-brand-red/30 text-brand-red text-sm font-semibold active:scale-[0.98] transition-transform"
                                        >
                                            {t('matchDetail.cancelMatch')}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* WhatsApp Invite CTA (Sticky at bottom) — hidden once the game ends */}
                            {!isMatchEnded && (
                            <div className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-40">
                                <a
                                    href={`https://wa.me/?text=${encodeURIComponent(
                                        `⚽ Join me for "${match.title}" on ${match.date} at ${match.time}!\n📍 ${match.venueName}\n💸 ${match.price} ${match.currency}\n${shareUrl}\n\nJoin on KoraLink!`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block bg-brand-green rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-[0_4px_20px_rgba(37,65,50,0.4)] active:scale-[0.98] transition-transform cursor-pointer"
                                >
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
                                </a>
                            </div>
                            )}
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
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">{t('matchDetail.organizer')}</p>
                                        <p className="text-sm font-bold text-brand-black">{match.organizer.name}</p>
                                    </div>
                                </div>
                                <button className="text-sm font-medium text-brand-green"
                                    onClick={() => {
                                        if (match.organizer) {
                                            setSelectedPlayer({
                                                id: match.hostId,
                                                userId: match.hostId,
                                                name: match.organizer.name,
                                                avatarUrl: match.organizer.avatarUrl,
                                                team: 'Home',
                                                isHost: true,
                                            });
                                        }
                                    }}>
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

                            {/* Action Buttons: Calendar + Share */}
                            <div className="flex gap-3 px-5 mt-4">
                                <a
                                    href={`${env.NEXT_PUBLIC_API_URL}/matches/${id}/calendar?format=ics`}
                                    download
                                    className="flex-1 flex items-center justify-center gap-2 bg-white rounded-full py-3 px-4 shadow-card active:scale-[0.98] transition-transform"
                                >
                                    <Calendar className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                    <span className="text-sm font-semibold text-brand-black">{t('matchDetail.addToCalendar')}</span>
                                </a>
                                <button
                                    onClick={() => handleShareMatch({ context: 'pre-join-actions' })}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white rounded-full py-3 px-4 shadow-card active:scale-[0.98] transition-transform"
                                >
                                    <Share2 className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                    <span className="text-sm font-semibold text-brand-black">{t('matchDetail.share')}</span>
                                </button>
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

                            {/* View Match Rules (accessible before join) */}
                            <div className="flex items-center justify-center gap-4 py-4">
                                <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                <button onClick={() => setShowRules(true)} className="text-sm font-semibold text-brand-black">
                                    {t('matchDetail.viewRules')}
                                </button>
                                <span className="text-gray-200">·</span>
                                <button onClick={() => setShowReportSheet(true)} className="text-sm font-semibold text-brand-red">
                                    {t('report.reportMatch')}
                                </button>
                            </div>

                            {/* Team Lineup (shows roster to anyone — even pre-join) */}
                            <div className="px-5 pt-6">
                                <TeamLineup format={match.format} roster={match.roster} hostId={match.hostId} onPlayerClick={setSelectedPlayer} />
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
                                    <button className="text-sm font-medium text-brand-green mt-3" onClick={() => setShowChatSheet(true)}>
                                        {t('matchDetail.viewAllComments')} {match.comments.length} {t('matchDetail.comments')}
                                    </button>
                                </div>
                            )}

                            {showJoin && (
                            <div className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md mx-auto px-5 z-40">
                                <div className="max-w-xl mx-auto">
                                    <button
                                        onClick={handleJoinClick}
                                        className="
                                            w-full py-4 rounded-2xl bg-brand-green text-white
                                            text-sm font-bold flex items-center justify-between px-6
                                            shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                                            active:scale-[0.98] transition-transform
                                        "
                                    >
                                        <span>
                                            {isMatchStarted || match.status === 'in_progress'
                                                ? t('matchDetail.joinOngoingMatch')
                                                : t('matchDetail.joinMatch')}
                                        </span>
                                        <span className="font-extrabold">
                                            {match.price === 0 ? t('gameDetails.free') : `${match.price} ${match.currency}`}
                                        </span>
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>

            {/* Match Rules Sheet */}
            <MatchRulesSheet
                isOpen={showRules}
                onClose={() => setShowRules(false)}
            />

            {/* Cancel Match Sheet (Host - Future Match) */}
            {match && (
                <CancelMatchSheet
                    isOpen={showCancelSheet}
                    onClose={() => setShowCancelSheet(false)}
                    onConfirm={() => { cancelMatch.mutate(id); setShowCancelSheet(false); }}
                    matchTitle={match.title}
                    matchTime={`${match.date}, ${match.time}`}
                    isPending={cancelMatch.isPending}
                />
            )}

            {/* Emergency Cancel Sheet (Host - Ongoing Match) */}
            {match && (
                <EmergencyCancelSheet
                    isOpen={showEmergencyCancelSheet}
                    onClose={() => setShowEmergencyCancelSheet(false)}
                    onConfirm={() => { cancelMatch.mutate(id); setShowEmergencyCancelSheet(false); }}
                    matchTitle={match.title}
                    matchTime={`${match.date}, ${match.time}`}
                    isPending={cancelMatch.isPending}
                />
            )}

            {/* Leave Match Sheet (Player) */}
            {match && (
                <LeaveMatchSheet
                    isOpen={showLeaveSheet}
                    onClose={() => setShowLeaveSheet(false)}
                    onConfirm={() => { leaveMatch.mutate(id); setShowLeaveSheet(false); }}
                    matchTitle={match.title}
                    matchTime={`${match.date}, ${match.time}`}
                    isPending={leaveMatch.isPending}
                />
            )}

            <BottomNav />

            {/* Ongoing Game Join Sheet */}
            {match && (
                <OngoingGameJoinSheet
                    isOpen={showOngoingJoinSheet}
                    onClose={() => setShowOngoingJoinSheet(false)}
                    onConfirm={proceedToJoin}
                    matchTitle={match.title}
                    price={match.price}
                    currency={match.currency}
                />
            )}

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

            {/* Chat Sheet */}
            {match && (
                <ChatSheet
                    isOpen={showChatSheet}
                    onClose={() => setShowChatSheet(false)}
                    matchId={match.id}
                    matchTitle={match.title}
                />
            )}

            {/* Attendance Sheet (Host) */}
            {match && (
                <AttendanceSheet
                    isOpen={showAttendanceSheet}
                    onClose={() => setShowAttendanceSheet(false)}
                    roster={match.roster}
                    currentUserId={currentUserId}
                    busyUserId={markNoShow.isPending ? markNoShow.variables?.targetUserId ?? null : null}
                    onToggle={(player) => markNoShow.mutate({ targetUserId: player.userId, noShow: !player.noShow })}
                />
            )}

            {/* Appeal Sheet (Player) */}
            {match && (
                <AppealSheet
                    isOpen={showAppealSheet}
                    onClose={() => setShowAppealSheet(false)}
                    matchTitle={match.title}
                    isPending={appeal.isPending}
                    error={appeal.isError ? appeal.error?.message ?? null : null}
                    onSubmit={(reason) => {
                        appeal.mutate({ reason }, {
                            onSuccess: () => {
                                setShowAppealSheet(false);
                                showToast(t('appeal.submittedToast'), 'success');
                            },
                        });
                    }}
                />
            )}

            {/* Report Sheet */}
            {match && (
                <ReportSheet
                    open={showReportSheet}
                    onClose={() => setShowReportSheet(false)}
                    subjectType="match"
                    subjectId={match.id}
                    subjectLabel={match.title}
                />
            )}

            {/* Player Profile Sheet */}
            <PlayerProfileSheet
                player={selectedPlayer}
                onClose={() => setSelectedPlayer(null)}
            />

            <Toast />
        </MobileFrame>
    );
}
