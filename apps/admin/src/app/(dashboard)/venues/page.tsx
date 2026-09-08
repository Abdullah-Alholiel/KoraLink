'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Pencil, Search, UserCog, XCircle } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { AdminVenue, ListResponse, PartnerVenueRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import VenueTransferDrawer from '@/components/VenueTransferDrawer';
import VenueFormDrawer from '@/components/VenueFormDrawer';

type VenuesResponse = ListResponse<AdminVenue> & { venues: AdminVenue[] };

export default function VenuesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tc = useTranslations('common');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<AdminVenue | null>(null);
  const [editing, setEditing] = useState<PartnerVenueRow | null>(null);
  const [selected, setSelected] = useState<AdminVenue | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  if (status !== 'all') qs.set('status', status);

  const { data, loading, error, reload } = useLiveAdminData<VenuesResponse>(`/admin/venues?${qs.toString()}`);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusyId(id);
    try {
      await api.post(`/admin/venues/${id}/decision`, { decision });
      reload();
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  /** Fetch the full venue row (hours/closed days live in the detail shape). */
  async function startEdit(v: AdminVenue) {
    setBusyId(v.id);
    try {
      const detail = await api.get<PartnerVenueRow>(`/admin/venues/${v.id}`);
      setEditing(detail);
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnDef<AdminVenue>[] = [
    {
      key: 'venue',
      header: t('thVenue'),
      role: 'identity',
      render: (v) => (
        <Link
          href={`/venues/${v.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-gray-900 hover:text-brand-600"
        >
          {v.name}
        </Link>
      ),
      secondary: (v) => v.address,
    },
    {
      key: 'pitches',
      header: t('thPitches'),
      role: 'value',
      align: 'end',
      tabular: true,
      cardLabel: t('thPitches'),
      render: (v) => v.pitch_count ?? 0,
    },
    {
      key: 'verification',
      header: t('thVerification'),
      role: 'meta',
      render: (v) => <StatusBadge status={v.verification_status ?? 'pending'} />,
    },
    {
      key: 'approved',
      header: ts('approved'),
      role: 'meta',
      render: (v) => <StatusBadge status={v.is_approved ? 'approved' : 'pending'} />,
    },
    {
      key: 'city',
      header: t('thCity'),
      role: 'detail',
      render: (v) => v.city,
    },
    {
      key: 'owner',
      header: t('thOwner'),
      role: 'detail',
      render: (v) => v.owner_name ?? '—',
    },
  ];

  return (
    <div>
      <PageHeader title={t('venuesTitle')} subtitle={t('venuesSubtitle')} />

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
              placeholder={t('searchVenue')}
              className="w-64 rounded-lg border border-gray-300 py-2 ps-8 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Search
          </button>
        </form>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="approved">{ts('approved')}</option>
          <option value="pending">{ts('pending')}</option>
          <option value="rejected">{ts('rejected')}</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingVenues')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.venues ?? []}
              rowKey={(v) => v.id}
              onRowClick={(v) => setSelected(v)}
              empty={<p className="px-8 py-10 text-sm text-gray-400">{tc('noData')}</p>}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.venues"
        title={selected?.name ?? t('thVenue')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thCity'), value: selected.city },
                { label: t('thOwner'), value: selected.owner_name ?? '—' },
                { label: t('thPitches'), value: selected.pitch_count ?? 0 },
                { label: t('thVerification'), value: <StatusBadge status={selected.verification_status ?? 'pending'} /> },
                { label: ts('approved'), value: <StatusBadge status={selected.is_approved ? 'approved' : 'pending'} /> },
                { label: t('thVenue'), value: selected.address },
              ]
            : []
        }
        actions={
          selected ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!selected.is_approved && (
                  <>
                    <button
                      onClick={() => decide(selected.id, 'approve')}
                      className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t('approveAction')}
                    </button>
                    <button
                      onClick={() => decide(selected.id, 'reject')}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <XCircle className="h-3.5 w-3.5" /> {t('rejectAction')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setTransferring(selected)}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
                >
                  <UserCog className="h-3.5 w-3.5" /> {t('transferAction')}
                </button>
                <button
                  onClick={() => startEdit(selected)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> {tc('edit')}
                </button>
              </div>
            )
          ) : undefined
        }
      />

      <VenueTransferDrawer
        venue={transferring}
        onClose={() => setTransferring(null)}
        onSaved={reload}
      />

      <VenueFormDrawer
        open={!!editing}
        venue={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
        endpointBase="/admin"
      />
    </div>
  );
}
