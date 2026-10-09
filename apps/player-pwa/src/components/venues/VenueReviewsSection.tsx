'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Star, Loader2, AlertTriangle, PenLine, MessageSquareText } from 'lucide-react';
import {
  useVenueReviews,
  useVenueReviewSubmit,
  type VenueReviewApi,
} from '@/hooks/useVenueReviews';
import { useAppStore } from '@/store/useAppStore';
import BottomSheet from '@/components/layout/BottomSheet';
import { formatCount } from '@/lib/format';

/**
 * P1-55 (run #117): booking-verified venue reviews on the club detail page.
 *
 * All 5 UX states live here: loading · error (localized + Retry) · empty ·
 * offline (bubble strip, page-level) · success. The write path is gated by
 * the SERVER's can_review flag (GET /venues/:id/reviews) — the CTA only
 * renders when the server would accept the POST, so the 403 path is a
 * defensive localized toast, never a reachable dead end. Signed-out visitors
 * get a sign-in CTA instead of a silent no-op (run #110 follow-up pattern).
 */

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${
            i <= Math.round(value)
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-300'
          }`}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

function ReviewRow({ review }: { review: VenueReviewApi }) {
  const t = useTranslations();
  const initials = (review.user.full_name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <li className="py-3">
      <div className="flex items-center gap-2.5">
        {review.user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.user.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brand-black truncate">
            {review.user.full_name || t('clubs.reviewAnonymous')}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Stars value={review.rating} size="w-3 h-3" />
            <span className="text-[10px] text-gray-400">
              {new Date(review.updated_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
        {review.mine && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green font-semibold flex-shrink-0">
            {t('clubs.reviewMine')}
          </span>
        )}
      </div>
      {review.comment && (
        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed break-words">
          {review.comment}
        </p>
      )}
    </li>
  );
}

export default function VenueReviewsSection({
  venueId,
  locale,
}: {
  venueId: string;
  locale: string;
}) {
  const t = useTranslations();
  const showToast = useAppStore((s) => s.showToast);
  const user = useAppStore((s) => s.user);
  const isHydrated = useAppStore((s) => s.isHydrated);
  const { data, isLoading, isError, refetch } = useVenueReviews(venueId);
  const submit = useVenueReviewSubmit(venueId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);

  function openSheet() {
    const mine = data?.reviews.find((r) => r.mine);
    setDraftRating(mine?.rating ?? 0);
    setDraftComment(mine?.comment ?? '');
    setSheetOpen(true);
  }

  function onSubmit() {
    if (draftRating < 1 || draftRating > 5) return;
    submit.mutate(
      { rating: draftRating, comment: draftComment.trim() || null },
      {
        onSuccess: () => {
          setSheetOpen(false);
          showToast(t('clubs.reviewThanks'), 'success');
        },
        onError: () => {
          // Defensive: the sheet only opens when can_review was true; a 403
          // here means eligibility lapsed mid-session. Localized, never raw.
          showToast(t('clubs.reviewNotAllowed'), 'error');
        },
      },
    );
  }

  // While loading (and for guests pre-hydration) render nothing — the page
  // already shows its own skeletons; an empty reviews block would flash.
  if (!isHydrated || isLoading) return null;

  if (isError) {
    return (
      <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-gray-700">{t('clubs.reviewsError')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-1.5 text-sm font-semibold text-brand-green underline underline-offset-2"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const mine = data.reviews.find((r) => r.mine);

  return (
    <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-4" data-testid="venue-reviews">
      {/* Header: aggregate + write CTA */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-brand-green uppercase tracking-widest">
            {t('clubs.reviewsTitle')}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Stars value={data.average} />
            <span className="text-sm font-bold text-brand-black" dir="ltr">
              {data.average > 0 ? data.average.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-gray-400">
              {t('clubs.reviewCount', { count: data.count })}
            </span>
          </div>
        </div>
        {user && data.can_review ? (
          <button
            type="button"
            onClick={openSheet}
            aria-label={mine ? t('clubs.reviewEditA11y') : t('clubs.reviewWriteA11y')}
            className="flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold px-3.5 py-2 rounded-full active:scale-95 transition-transform flex-shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" strokeWidth={2} />
            {mine ? t('clubs.reviewEdit') : t('clubs.reviewWrite')}
          </button>
        ) : null}
      </div>

      {/* Guest CTA — sign-in instead of a silent nothing (run #110 pattern) */}
      {!user && isHydrated && (
        <div className="mt-3 flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 flex-1">{t('clubs.reviewsSignInHint')}</p>
          <Link
            href={`/${locale}/login`}
            className="text-xs font-bold text-brand-green underline underline-offset-2 flex-shrink-0"
          >
            {t('clubs.reviewsSignInCta')}
          </Link>
        </div>
      )}

      {/* List */}
      {data.reviews.length > 0 ? (
        <ul className="mt-1 divide-y divide-gray-100">
          {data.reviews.slice(0, 5).map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex items-start gap-2.5 text-gray-400">
          <MessageSquareText className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{t('clubs.reviewsEmpty')}</p>
        </div>
      )}

      {/* Write sheet (z-[60]/[70] handled by BottomSheet) */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        maxHeightClass="max-h-[70dvh]"
        widthClass="max-w-md"
      >
        <div className="p-5">
          <h2 className="text-base font-bold text-brand-black">
            {mine ? t('clubs.reviewEditTitle') : t('clubs.reviewWriteTitle')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">{t('clubs.reviewVerifiedNote')}</p>

          {/* Star input */}
          <div className="mt-4 flex items-center justify-center gap-2" role="radiogroup" aria-label={t('clubs.reviewRatingA11y')}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={draftRating === i}
                aria-label={t('clubs.reviewStarA11y', { count: i })}
                onMouseEnter={() => setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setDraftRating(i)}
                className="p-1 active:scale-90 transition-transform"
              >
                <Star
                  className={`w-9 h-9 ${
                    i <= (hoverRating || draftRating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>

          {/* Comment */}
          <textarea
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('clubs.reviewPlaceholder')}
            aria-label={t('clubs.reviewCommentA11y')}
            className="mt-4 w-full rounded-xl border border-gray-200 focus:border-brand-green focus:outline-none p-3 text-sm text-gray-700 resize-none"
          />
          <p className="text-[10px] text-gray-400 text-end" dir="ltr">
            {formatCount(draftComment.length, locale === 'ar' ? 'ar' : 'en')}/500
          </p>

          <button
            type="button"
            disabled={draftRating < 1 || submit.isPending}
            onClick={onSubmit}
            className="mt-2 w-full bg-brand-green text-white text-sm font-bold py-3 rounded-full disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {submit.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('clubs.reviewSubmit')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
