'use client';

import { useTranslations } from 'next-intl';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Download, Loader2, Search, TimerOff } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { AdminUser, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import ConfirmDialog from '@/components/ConfirmDialog';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvAmount, csvDate } from '@/lib/csv-export';
import { useExportFeedback, ExportFeedbackNote } from '@/lib/use-export-feedback';

type UsersResponse = ListResponse<AdminUser> & { users: AdminUser[] };

/** P2-107: hard cap on a bulk moderation batch (server enforces the same). */
const BULK_CAP = 50;

/** P2-107: rows eligible for bulk moderation — the same rule the drawer uses:
 *  PDPL-deleted accounts are frozen (purge/restore/delete never in bulk). */
function bulkEligible(u: AdminUser): boolean {
  return !u.deleted_at;
}

function userStatus(u: AdminUser): string {
  // P1-37 (run #31): PDPL state first — a deleted account is neither
  // active nor banned; the ops view must label it as deleted.
  if (u.deleted_at) return 'deleted';
  if (u.banned_at) return 'banned';
  if (u.suspended_until && new Date(u.suspended_until).getTime() > Date.now()) return 'suspended';
  return 'active';
}

/**
 * P1-37 (run #31): purge visibility for a soft-deleted row.
 * - Scheduled (grace window): `purgesIn` = days until hard-purge
 *   (deleted_at + 30d − now).
 * - Already-purged ghost: the purge job refreshes deleted_at AND marks
 *   phone='purged-<id12>' — detect via the phone prefix and report done.
 */
function purgeInfo(u: AdminUser): { purged: boolean; daysRemaining?: number } {
  if (!u.deleted_at) return { purged: false };
  if (u.phone.startsWith('purged-')) return { purged: true };
  // PDPL grace window — keep in sync with the API's PDPL_GRACE_DAYS
  // (apps/api/src/common/constants/pdpl.ts); cross-app constant, cannot be
  // imported (run #32 drift-trap cleanup).
  const PDPL_GRACE_DAYS_ADMIN = 30;
  const purgeAt = new Date(u.deleted_at).getTime() + PDPL_GRACE_DAYS_ADMIN * 86_400_000;
  return { purged: false, daysRemaining: Math.max(0, Math.ceil((purgeAt - Date.now()) / 86_400_000)) };
}

export default function UsersPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  // ── P2-107: bulk selection state (current page only) ──
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'ban' | 'suspend' | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  const sortParts = sort ? sort.split(':') : null;
  const sortField = sortParts?.[0] ?? '';
  const sortDir = sortParts?.[1] ?? '';

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  if (role) qs.set('role', role);
  if (status && status !== 'all') qs.set('status', status);
  if (sortField) qs.set('sortBy', sortField);
  if (sortDir) qs.set('dir', sortDir);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<UsersResponse>(`/admin/users?${qs.toString()}`);

  const rows = data?.users ?? [];
  const exportFeedback = useExportFeedback();
  const exportDisabled = loading || !!error || rows.length === 0 || exportFeedback.exporting;

  // ── P2-107: selection derived state ──
  const eligibleRows = useMemo(() => rows.filter(bulkEligible), [rows]);
  const selectableIds = useMemo(
    () => new Set(eligibleRows.map((u) => u.id)),
    [eligibleRows],
  );
  const checkedCount = useMemo(
    () => [...checkedIds].filter((id) => selectableIds.has(id)).length,
    [checkedIds, selectableIds],
  );
  const allSelected = eligibleRows.length > 0 && checkedCount === eligibleRows.length;
  const someSelected = checkedCount > 0 && !allSelected;
  // Over the cap: the server 400s >50, so block the action client-side and say why.
  const overCap = checkedCount > BULK_CAP;

  function toggleRow(u: AdminUser) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.add(u.id);
      return next;
    });
  }
  function toggleAll() {
    setCheckedIds(allSelected ? new Set() : new Set(selectableIds));
  }
  // Page/filter/sort change invalidates the visual selection — clear it so the
  // action bar can never act on rows that are no longer visible.
  function clearSelection() {
    setCheckedIds(new Set());
    setBulkNote(null);
  }

  async function runBulk(action: 'ban' | 'suspend') {
    setBulkAction(null);
    setBulkRunning(true);
    setActionError(null);
    try {
      const res = await api.post<{ updated: number; requested: number; skipped: Array<{ id: string; reason: string }> }>(
        '/admin/users/bulk',
        { action, ids: [...checkedIds].filter((id) => selectableIds.has(id)) },
      );
      setBulkNote(
        t('bulkResult', { updated: res.updated, requested: res.requested }) +
          (res.skipped.length > 0 ? ` — ${t('bulkSkipped', { count: res.skipped.length })}` : ''),
      );
      trackEvent('admin_bulk_moderation', { page: 'admin.users', action, requested: res.requested, updated: res.updated });
      clearSelectionIds();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : ts('failed'));
    } finally {
      setBulkRunning(false);
    }
  }
  function clearSelectionIds() {
    setCheckedIds(new Set());
  }


  // P2-147: export the FULL filtered set (same filters/sort as the table),
  // not just the rendered page.
  async function onExport() {
    const exported = await exportFeedback.runFullExport<UsersResponse, AdminUser>({
      url: `/admin/users?${qs.toString()}`,
      rowKey: 'users',
      build: (allRows) => ({
        columns: [
          { key: 'user', header: t('thUser'), value: (u: AdminUser) => u.full_name ?? '' },
          { key: 'handle', header: t('thHandle'), value: (u: AdminUser) => u.handle ?? '' },
          { key: 'phone', header: t('thPhone'), value: (u: AdminUser) => u.phone ?? '' },
          { key: 'role', header: t('thRole'), value: (u: AdminUser) => u.role ?? '' },
          { key: 'status', header: t('thStatus'), value: (u: AdminUser) => userStatus(u) },
          { key: 'wallet', header: t('thWallet'), value: (u: AdminUser) => csvAmount(u.wallet_balance) },
          { key: 'karma', header: t('thKarma'), value: (u: AdminUser) => String(u.karma_score ?? 0) },
          { key: 'noShows', header: t('thNoShows'), value: (u: AdminUser) => String(u.no_show_count ?? 0) },
          { key: 'joined', header: t('thJoined'), value: (u: AdminUser) => csvDate(u.created_at) },
          { key: 'id', header: t('thId') },
        ],
        rows: allRows,
        filePrefix: 'koralink-users',
        timestamp: new Date(),
      }),
    });
    if (exported !== null) trackEvent('admin_csv_export', { page: 'admin.users', rows: exported });
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await api.patch(`/admin/users/${id}`, body);
      reload();
      setSelected(null);
    } catch (e) {
      // What + why + next: surface the API reason (e.g. last-admin guard)
      // instead of silently swallowing the rejection — the banner stays until
      // the next attempt.
      setActionError(e instanceof Error ? e.message : ts('failed'));
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      key: 'user',
      header: t('thUser'),
      role: 'identity',
      render: (u) => (
        <Link
          href={`/users/${u.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-gray-900 hover:text-brand-600"
        >
          {u.full_name ?? '—'}
        </Link>
      ),
      secondary: (u) => `@${u.handle ?? 'no-handle'}`,
    },
    {
      key: 'wallet',
      header: t('thWallet'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (u) => formatMoney(u.wallet_balance),
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'meta',
      render: (u) => <StatusBadge status={userStatus(u)} />,
    },
    {
      key: 'joined',
      header: t('thJoined'),
      role: 'meta',
      cardLabel: t('thJoined'),
      render: (u) => <span dir="ltr">{formatDate(u.created_at)}</span>,
    },
    {
      key: 'phone',
      header: t('thPhone'),
      role: 'detail',
      render: (u) => <span dir="ltr">{u.phone}</span>,
    },
    {
      key: 'role',
      header: t('thRole'),
      role: 'detail',
      render: (u) => u.role,
    },
    {
      key: 'karma',
      header: t('thKarma'),
      role: 'detail',
      tabular: true,
      render: (u) => u.karma_score,
    },
    {
      key: 'noShows',
      header: t('thNoShows'),
      role: 'detail',
      tabular: true,
      render: (u) => u.no_show_count,
    },
    {
      key: 'purge',
      header: t('thPurgeScheduled'),
      role: 'detail',
      render: (u) => {
        const info = purgeInfo(u);
        if (info.purged) return <span className="text-gray-500">{ts('purged')}</span>;
        if (info.daysRemaining !== undefined) return ts('purgeInDays', { count: info.daysRemaining });
        return '—';
      },
    },
  ];

  const sortOptions = [
    { value: '', label: tl('sortNewest') },
    { value: 'created_at:asc', label: tl('sortOldest') },
    { value: 'wallet_balance:desc', label: tl('sortAmountHigh') },
    { value: 'full_name:asc', label: tl('sortNameAZ') },
  ];

  function onSortChange(v: string) {
    setSort(v);
    setPage(1);
    if (v) {
      const [field, dir] = v.split(':');
      trackEvent('admin_list_sort', { page: 'admin.users', sortBy: field, dir });
    }
  }

  return (
    <div>
      <PageHeader title={t('usersTitle')} subtitle={t('usersSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('usersSearchPh')}
              className="w-64 rounded-lg border border-gray-300 py-2 ps-8 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            {tc('search')}
          </button>
        </form>

        <select
          aria-label={tc('filterByRole')}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allRoles')}</option>
          <option value="Player">{t('rolePlayer')}</option>
          <option value="VenueOwner">{t('roleVenueOwner')}</option>
          <option value="Admin">{t('roleAdmin')}</option>
        </select>

        <select
          aria-label={tc('filterByStatus')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="active">{ts('active')}</option>
          <option value="banned">{ts('banned')}</option>
          <option value="suspended">{ts('suspended')}</option>
          <option value="deleted">{ts('deleted')}</option>
        </select>

          <SortSelect value={sort} options={sortOptions} onChange={onSortChange} />
          <button
            type="button"
            onClick={onExport}
            disabled={exportDisabled}
            aria-label={tc('exportCsv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {t('exportUsers')}
          </button>
        </div>

        {/* ── P2-107: bulk action bar (visible when a selection exists) ── */}
        {checkedCount > 0 && (
          <div
            role="toolbar"
            aria-label={t('bulkBarLabel')}
            className="mx-8 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-brand-50/60 px-4 py-2.5"
          >
            <span className="text-sm font-semibold text-gray-800">
              {t('bulkSelectedCount', { count: checkedCount })}
              {overCap && (
                <span className="ms-2 font-normal text-red-600">{t('bulkCapNote', { cap: BULK_CAP })}</span>
              )}
            </span>
            <button
              type="button"
              disabled={bulkRunning || overCap}
              onClick={() => setBulkAction('ban')}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" /> {t('bulkBan')}
            </button>
            <button
              type="button"
              disabled={bulkRunning || overCap}
              onClick={() => setBulkAction('suspend')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TimerOff className="h-3.5 w-3.5" /> {t('bulkSuspend')}
            </button>
            {bulkRunning && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            <button
              type="button"
              onClick={clearSelection}
              className="ms-auto text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {t('bulkClear')}
            </button>
          </div>
        )}
        {bulkNote && (
          <p role="status" className="mx-8 mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            {bulkNote}
          </p>
        )}

      {/* shared always-mounted live-region pair (success polite /
           error assertive) — markup lives beside the hook */}
      <ExportFeedbackNote feedback={exportFeedback} />

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingUsers')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          {actionError && (
            <p role="alert" className="mx-8 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {t('actionFailed', { error: actionError })}
            </p>
          )}
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(u) => u.id}
              onRowClick={(u) => setSelected(u)}
              empty={<EmptyState message={tc('noData')} />}
              selection={{
                selectedIds: checkedIds,
                isRowSelectable: bulkEligible,
                onToggle: toggleRow,
                onToggleAll: toggleAll,
                allSelected,
                someSelected,
                selectAllLabel: t('bulkSelectAll'),
                rowLabel: (u) => t('bulkSelectRow', { name: u.full_name ?? u.handle ?? u.id }),
              }}
            />
          </div>
          <Pagination
            page={page}
            perPage={20}
            total={data?.total ?? 0}
            onPage={(p) => {
              setPage(p);
              clearSelection();
            }}
          />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.users"
        title={selected?.full_name ?? t('thUser')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thUser'), value: selected.full_name ?? '—' },
                { label: t('thPhone'), value: <span dir="ltr">{selected.phone}</span> },
                { label: t('thRole'), value: selected.role },
                { label: t('thWallet'), value: formatMoney(selected.wallet_balance) },
                { label: t('thKarma'), value: selected.karma_score },
                { label: t('thNoShows'), value: selected.no_show_count },
                { label: t('thStatus'), value: <StatusBadge status={userStatus(selected)} /> },
                { label: t('thJoined'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
                {
                  label: t('thPurgeScheduled'),
                  value: (() => {
                    const info = purgeInfo(selected);
                    if (info.purged) return <span className="text-gray-500">{ts('purged')}</span>;
                    if (info.daysRemaining !== undefined) {
                      return ts('purgeInDays', { count: info.daysRemaining });
                    }
                    return '—';
                  })(),
                },
              ]
            : []
        }
        actions={
          selected && userStatus(selected) !== 'deleted' ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {userStatus(selected) === 'banned' ? (
                  <button
                    onClick={() => act(selected.id, { banned: false })}
                    className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('unbanAction')}
                  </button>
                ) : (
                  <button
                    onClick={() => act(selected.id, { banned: true })}
                    className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Ban className="h-3.5 w-3.5" /> {t('banAction')}
                  </button>
                )}
                {userStatus(selected) === 'suspended' ? (
                  <button
                    onClick={() => act(selected.id, { suspendedUntil: null })}
                    className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('liftAction')}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      act(selected.id, {
                        suspendedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    <TimerOff className="h-3.5 w-3.5" /> {t('suspendAction')}
                  </button>
                )}
              </div>
            )
          ) : undefined
        }
      />

      {/* ── P2-107: bulk confirmation — names the action + affected count ── */}
      <ConfirmDialog
        open={bulkAction !== null}
        danger={bulkAction === 'ban'}
        title={
          bulkAction === 'ban'
            ? t('bulkConfirmBanTitle')
            : t('bulkConfirmSuspendTitle')
        }
        message={
          bulkAction === 'ban'
            ? t('bulkConfirmBanBody', { count: checkedCount })
            : t('bulkConfirmSuspendBody', { count: checkedCount })
        }
        confirmLabel={bulkAction === 'ban' ? t('bulkBan') : t('bulkSuspend')}
        onConfirm={() => bulkAction && runBulk(bulkAction)}
        onClose={() => setBulkAction(null)}
      />
    </div>
  );
}
