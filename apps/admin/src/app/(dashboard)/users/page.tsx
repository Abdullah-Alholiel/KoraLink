'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Loader2, Search, TimerOff } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminUser, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import { trackEvent } from '@/providers/ObservabilityProvider';

type UsersResponse = ListResponse<AdminUser> & { users: AdminUser[] };

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
  const purgeAt = new Date(u.deleted_at).getTime() + 30 * 86_400_000;
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
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const sortParts = sort ? sort.split(':') : null;
  const sortField = sortParts?.[0] ?? '';
  const sortDir = sortParts?.[1] ?? '';

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  if (role) qs.set('role', role);
  if (status && status !== 'all') qs.set('status', status);
  if (sortField) qs.set('sortBy', sortField);
  if (sortDir) qs.set('dir', sortDir);

  const { data, loading, error, reload } = useLiveAdminData<UsersResponse>(`/admin/users?${qs.toString()}`);

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await api.patch(`/admin/users/${id}`, body);
      reload();
      setSelected(null);
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
      <PageHeader title={t('usersTitle')} subtitle={t('usersSubtitle')} />

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
            Search
          </button>
        </form>

        <select
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
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingUsers')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">{t('loadFailed')}: {error}</div>
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.users ?? []}
              rowKey={(u) => u.id}
              onRowClick={(u) => setSelected(u)}
              empty={<p className="px-8 py-10 text-sm text-gray-400">{tc('noData')}</p>}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
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
    </div>
  );
}
