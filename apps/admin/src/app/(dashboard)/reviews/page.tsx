'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import LoadError from '@/components/LoadError';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import RecordDrawer from '@/components/RecordDrawer';
import { api, ApiError } from '@/lib/api';
import type { ListResponse, VenueReview, VenueReviewMutation } from '@/lib/types';
import { useLiveAdminData } from '@/lib/use-live-data';
import { cn, formatDate } from '@/lib/utils';
import { trackEvent } from '@/providers/ObservabilityProvider';

type ReviewsResponse = ListResponse<VenueReview> & { reviews: VenueReview[] };
type ReviewAction = 'hide' | 'restore' | 'delete';
type FailureReason = 'auth' | 'access' | 'gone' | 'server' | 'network';

const PER_PAGE = 25;

function failureReason(err: unknown): FailureReason {
  if (!(err instanceof ApiError)) return 'network';
  if (err.status === 401) return 'auth';
  if (err.status === 403) return 'access';
  if (err.status === 404) return 'gone';
  return 'server';
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span dir="ltr" role="img" aria-label={label} className="whitespace-nowrap text-amber-500">
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

export default function ReviewsPage() {
  const t = useTranslations('reviews');
  const [venueId, setVenueId] = useState('');
  const [hidden, setHidden] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VenueReview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Carries the review id so a failure can never render in another review's
  // drawer; seq remounts the node so role=alert re-announces a repeat failure.
  const [failure, setFailure] = useState<{
    id: string;
    action: ReviewAction;
    reason: FailureReason;
    seq: number;
  } | null>(null);

  const { data: venuesData } = useLiveAdminData<{ venues: Array<{ id: string; name: string }> }>(
    '/admin/venues?perPage=100',
  );

  const qs = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
  if (venueId) qs.set('venueId', venueId);
  if (hidden) qs.set('hidden', hidden);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<ReviewsResponse>(
    `/admin/venue-reviews?${qs.toString()}`,
  );
  const rows = data?.reviews ?? [];

  // Hiding/deleting the last row of the last page would strand the operator on
  // an empty page — step back to the nearest page with rows.
  useEffect(() => {
    if (!loading && data && data.reviews.length === 0 && page > 1) setPage(page - 1);
  }, [loading, data, page]);

  async function run(review: VenueReview, action: ReviewAction) {
    setBusyId(review.id);
    setFailure(null);
    try {
      if (action === 'delete') {
        await api.delete<VenueReviewMutation>(`/admin/venue-reviews/${review.id}`);
        setSelected((cur) => (cur?.id === review.id ? null : cur));
      } else {
        const updated = await api.post<VenueReviewMutation>(
          `/admin/venue-reviews/${review.id}/${action}`,
        );
        setSelected((cur) =>
          cur?.id === review.id
            ? { ...cur, hidden_at: updated.hidden_at, updated_at: updated.updated_at }
            : cur,
        );
      }
      reload();
      trackEvent(`admin_review_${action}_success`, { page: 'admin.reviews' });
    } catch (err) {
      trackEvent(`admin_review_${action}_failed`, { page: 'admin.reviews' });
      setFailure((prev) => ({
        id: review.id,
        action,
        reason: failureReason(err),
        seq: (prev?.seq ?? 0) + 1,
      }));
    } finally {
      setBusyId(null);
    }
  }

  const statusChip = (r: VenueReview) => (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        r.hidden_at ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700',
      )}
    >
      {r.hidden_at ? t('hidden') : t('visible')}
    </span>
  );

  const stars = (r: VenueReview) => (
    <Stars rating={r.rating} label={t('ratingValue', { rating: r.rating })} />
  );

  const columns: ColumnDef<VenueReview>[] = [
    {
      key: 'venue',
      header: t('thVenue'),
      role: 'value',
      tabular: false,
      render: (r) => (
        <span dir="auto" className="block max-w-[14rem] truncate font-medium text-gray-900">
          {r.venue_name}
        </span>
      ),
    },
    {
      key: 'author',
      header: t('thAuthor'),
      role: 'meta',
      render: (r) => <span dir="auto">{r.author_name ?? '—'}</span>,
    },
    { key: 'rating', header: t('thRating'), role: 'meta', render: stars },
    {
      key: 'excerpt',
      header: t('thExcerpt'),
      role: 'value',
      tabular: false,
      render: (r) =>
        r.comment ? (
          <span dir="auto" className="block max-w-xs truncate text-gray-700">
            {r.comment}
          </span>
        ) : (
          <span className="text-gray-400">{t('noComment')}</span>
        ),
    },
    { key: 'status', header: t('thStatus'), role: 'meta', render: statusChip },
    {
      key: 'updated',
      header: t('thUpdated'),
      role: 'meta',
      cardLabel: t('thUpdated'),
      render: (r) => <span dir="ltr">{formatDate(r.updated_at)}</span>,
    },
  ];

  const busy = !!selected && busyId === selected.id;
  const selectedFailure = selected && failure?.id === selected.id ? failure : null;

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<LiveBadge live={live} stale={stale} />}
      />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <select
          aria-label={t('filterVenue')}
          value={venueId}
          onChange={(e) => {
            setVenueId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allVenues')}</option>
          {(venuesData?.venues ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('filterStatus')}
          value={hidden}
          onChange={(e) => {
            setHidden(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="false">{t('visible')}</option>
          <option value="true">{t('hidden')}</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loading')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r)}
              empty={<EmptyState message={venueId || hidden ? t('emptyFiltered') : t('empty')} />}
            />
          </div>
          <Pagination page={page} perPage={PER_PAGE} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.reviews"
        title={selected?.venue_name ?? t('thVenue')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thVenue'), value: <span dir="auto">{selected.venue_name}</span> },
                { label: t('thAuthor'), value: <span dir="auto">{selected.author_name ?? '—'}</span> },
                { label: t('thRating'), value: stars(selected) },
                { label: t('thStatus'), value: statusChip(selected) },
                {
                  label: t('thComment'),
                  value: selected.comment ? (
                    <span dir="auto" className="whitespace-pre-wrap break-words">
                      {selected.comment}
                    </span>
                  ) : (
                    t('noComment')
                  ),
                },
                { label: t('thCreated'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
                { label: t('thUpdated'), value: <span dir="ltr">{formatDate(selected.updated_at)}</span> },
                ...(selected.hidden_at
                  ? [{ label: t('thHiddenAt'), value: <span dir="ltr">{formatDate(selected.hidden_at)}</span> }]
                  : []),
              ]
            : []
        }
        actions={
          selected ? (
            <>
              {selectedFailure && (
                <p
                  role="alert"
                  key={`failure-${selectedFailure.seq}`}
                  className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700"
                >
                  {selectedFailure.action === 'hide'
                    ? t('hideFailed')
                    : selectedFailure.action === 'restore'
                      ? t('restoreFailed')
                      : t('deleteFailed')}{' '}
                  {selectedFailure.reason === 'auth'
                    ? t('reasonAuth')
                    : selectedFailure.reason === 'access'
                      ? t('reasonAccess')
                      : selectedFailure.reason === 'gone'
                        ? t('reasonGone')
                        : selectedFailure.reason === 'server'
                          ? t('reasonServer')
                          : t('reasonNetwork')}
                </p>
              )}
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <>
                  <button
                    onClick={() => run(selected, selected.hidden_at ? 'restore' : 'hide')}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {selected.hidden_at ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {selected.hidden_at ? t('restore') : t('hide')}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
                  </button>
                </>
              )}
            </>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('deleteConfirmTitle')}
        message={t('deleteConfirmMessage')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          if (selected) run(selected, 'delete');
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
