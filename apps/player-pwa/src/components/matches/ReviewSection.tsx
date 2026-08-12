'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Star, Loader2, Check, X } from 'lucide-react';
import { useSubmitReviews, type ReviewInput } from '@/hooks/useUser';
import type { RosterPlayer } from '@/types';
import { useAppStore } from '@/store/useAppStore';

interface ReviewSectionProps {
    matchId: string;
    roster: RosterPlayer[];
    currentUserId?: string;
}

export default function ReviewSection({ matchId, roster, currentUserId }: ReviewSectionProps) {
    const t = useTranslations();
    const submitReviews = useSubmitReviews(matchId);
    const showToast = useAppStore((s) => s.showToast);

    // Only review players who aren't the current user
    const reviewablePlayers = roster.filter((p) => p.userId !== currentUserId);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [showSheet, setShowSheet] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const ratedCount = Object.keys(ratings).length;

    const handleSubmit = () => {
        const reviews: ReviewInput[] = Object.entries(ratings).map(([playerId, rating]) => ({
            revieweeId: playerId,
            rating,
        }));

        if (reviews.length === 0) return;

        submitReviews.mutate(reviews, {
            onSuccess: () => {
                setSubmitted(true);
                setShowSheet(false);
                showToast(t('reviews.submitted'), 'success');
            },
            onError: () => {
                showToast(t('common.error'), 'error');
            },
        });
    };

    if (submitted) {
        return (
            <div className="mx-5 mt-3 bg-brand-green/5 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
                <span className="text-sm font-medium text-brand-green">{t('reviews.thankYou')}</span>
            </div>
        );
    }

    return (
        <>
            {/* Trigger card */}
            <div className="mx-5 mt-3 bg-white rounded-2xl shadow-card p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" strokeWidth={1.5} />
                        </div>
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                            {t('reviews.title')}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">{t('reviews.subtitle')}</p>
                <button
                    onClick={() => setShowSheet(true)}
                    className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3.5 hover:bg-amber-50/50 active:scale-[0.98] transition-all"
                >
                    <span className="text-sm font-semibold text-brand-black">
                        {ratedCount > 0
                            ? `${ratedCount} ${t('reviews.rated')}`
                            : t('reviews.ratePlayers')}
                    </span>
                    <div className="flex items-center gap-1">
                        {reviewablePlayers.slice(0, 4).map((p) => (
                            <div key={p.id} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[9px] font-bold text-gray-500">
                                {p.name.charAt(0)}
                            </div>
                        ))}
                    </div>
                </button>
            </div>

            {/* Bottom sheet for rating players */}
            {showSheet && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-[60] animate-fade-in" onClick={() => setShowSheet(false)} />
                    <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-[70] animate-slide-up max-h-[80vh] flex flex-col">
                        {/* Pull handle */}
                        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                            <div className="w-10 h-1 rounded-full bg-gray-300" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-50 flex-shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-brand-black">{t('reviews.title')}</h2>
                                <p className="text-xs text-gray-400 mt-0.5">{t('reviews.subtitle')}</p>
                            </div>
                            <button
                                onClick={() => setShowSheet(false)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
                            >
                                <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
                            </button>
                        </div>

                        {/* Player list */}
                        <div className="flex-1 overflow-y-auto scroll-container px-5 py-3">
                            <div className="space-y-3">
                                {reviewablePlayers.map((player) => (
                                    <div key={player.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs font-bold text-gray-500">
                                                {player.name.charAt(0)}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-brand-black truncate">{player.name}</p>
                                            {player.isHost && (
                                                <span className="text-[10px] text-amber-600 font-medium">👑 {t('matchDetail.organizer')}</span>
                                            )}
                                        </div>
                                        {/* Star rating */}
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() =>
                                                        setRatings((prev) => ({
                                                            ...prev,
                                                            [player.userId]: star === prev[player.userId] ? 0 : star,
                                                        }))
                                                    }
                                                    className="active:scale-90 transition-transform"
                                                >
                                                    <Star
                                                        className={`w-5 h-5 ${
                                                            (ratings[player.userId] ?? 0) >= star
                                                                ? 'text-amber-500 fill-amber-500'
                                                                : 'text-gray-300'
                                                        }`}
                                                        strokeWidth={1.5}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Submit footer */}
                        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                            <button
                                onClick={handleSubmit}
                                disabled={ratedCount === 0 || submitReviews.isPending}
                                className="w-full py-3.5 rounded-2xl bg-brand-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {submitReviews.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                                        {t('reviews.submitting')}
                                    </>
                                ) : (
                                    <>
                                        {t('reviews.submit')} ({ratedCount})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
