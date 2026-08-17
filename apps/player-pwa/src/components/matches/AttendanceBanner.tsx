'use client';

import { useTranslations } from 'next-intl';
import { ClipboardCheck, ShieldAlert, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useMyDispute } from '@/hooks/useDisputes';

interface AttendanceBannerProps {
    matchId: string;
    isHost: boolean;
    isJoined: boolean;
    status: 'open' | 'closing_soon' | 'full' | 'in_progress' | 'completed' | 'cancelled';
    /** The current user's roster entry (null when not in roster). */
    myRoster: { userId: string; noShow: boolean } | null;
    onOpenAttendance: () => void;
    onOpenAppeal: () => void;
}

/**
 * Attendance & appeal banners on the match detail page:
 * - Host (in_progress/completed): "Take attendance" CTA
 * - Player marked no-show with no dispute yet: appeal CTA
 * - Player with open dispute: under-review banner
 * - Player with resolved dispute: outcome banner
 */
export default function AttendanceBanner({
    matchId,
    isHost,
    myRoster,
    status,
    onOpenAttendance,
    onOpenAppeal,
}: AttendanceBannerProps) {
    const t = useTranslations('attendance');
    const tA = useTranslations('appeal');
    const { data: dispute } = useMyDispute(matchId, !!myRoster?.noShow);

    const attendanceWindow = status === 'in_progress' || status === 'completed';

    // ── Host: take attendance ──
    if (isHost && attendanceWindow) {
        return (
            <button
                onClick={onOpenAttendance}
                className="mx-5 mt-4 w-[calc(100%-2.5rem)] bg-white rounded-2xl shadow-card p-4 flex items-center gap-3 text-start active:scale-[0.99] transition-transform"
            >
                <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-5 h-5 text-brand-green" strokeWidth={2} />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-bold text-brand-black">{t('takeAttendance')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('takeAttendanceDesc')}</p>
                </div>
            </button>
        );
    }

    // ── Player: marked no-show ──
    if (myRoster?.noShow) {
        // Open dispute → under review
        if (dispute && (dispute.status === 'opened' || dispute.status === 'under_review')) {
            return (
                <div className="mx-5 mt-4 bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-blue-600" strokeWidth={2} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-blue-800">{tA('underReviewTitle')}</p>
                        <p className="text-xs text-blue-600/80 mt-0.5">{tA('underReviewDesc')}</p>
                    </div>
                </div>
            );
        }
        // Resolved in the player's favour → no-show reversed
        if (dispute && dispute.status === 'resolved') {
            return (
                <div className="mx-5 mt-4 bg-brand-green/5 border border-brand-green/20 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-brand-green" strokeWidth={2} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-brand-green">{tA('resolvedTitle')}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tA('resolvedDesc')}</p>
                    </div>
                </div>
            );
        }
        // Rejected appeal (or no dispute yet) → can (re)open one
        return (
            <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert className="w-5 h-5 text-amber-600" strokeWidth={2} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-amber-900">{t('markedNoShowYou')}</p>
                        <p className="text-xs text-amber-700 mt-0.5">{tA('appealHint')}</p>
                    </div>
                </div>
                {dispute?.status === 'rejected' ? (
                    <div className="mt-3 flex items-center gap-2 px-3">
                        <XCircle className="w-4 h-4 text-amber-600 flex-shrink-0" strokeWidth={2} />
                        <p className="text-xs text-amber-700">{tA('rejectedDesc')}</p>
                    </div>
                ) : (
                    <button
                        onClick={onOpenAppeal}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-full py-2.5 text-sm font-bold active:scale-[0.98] transition-transform shadow-[0_4px_16px_rgba(245,158,11,0.35)]"
                    >
                        <ShieldAlert className="w-4 h-4" strokeWidth={2} />
                        {tA('appealCta')}
                    </button>
                )}
            </div>
        );
    }

    return null;
}
