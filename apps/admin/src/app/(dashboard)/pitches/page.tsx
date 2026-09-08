'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { AdminPitchList, AdminPitchRow, AdminVenueListRow, PartnerSlot } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import PitchFormDrawer from '@/components/PitchFormDrawer';
import ScheduleDrawer from '@/components/ScheduleDrawer';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import type { PitchFormResult } from '@/components/PitchFormDrawer';

interface SlotsResponse {
  slots: PartnerSlot[];
}

/**
 * HQ pitch management (admin-ux-overhaul slice 2; restructured 2026-09-07):
 * every pitch across all venues with owner resolution, search, and admin edit
 * (rate, size, active, cross-venue move = effective ownership hand-off).
 */
export default function AdminPitchesPage() {
  const t = useTranslations('adminPitches');
  const ts = useTranslations('status');
  const tc = useTranslations('common');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminPitchRow | null>(null);
  const [schedulePitchId, setSchedulePitchId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminPitchRow | null>(null);

  // Debounced search: 300ms after the last keystroke, back to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  const { data, loading, error, reload } = useLiveAdminData<AdminPitchList>(
    `/admin/pitches?${qs.toString()}`,
    ['venues'],
  );

  // Venue options for the edit drawer (cross-venue move / ownership hand-off).
  const venues = useLiveAdminData<{ venues: AdminVenueListRow[] }>('/admin/venues?perPage=100', ['venues']);

  // Slots for the schedule drawer (admin slot endpoints).
  function weekStart(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return d.toISOString().slice(0, 10);
  }
  function weekEnd(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6);
    return d.toISOString().slice(0, 10);
  }
  const scheduleState = useLiveAdminData<SlotsResponse>(
    schedulePitchId ? `/admin/pitches/${schedulePitchId}/slots?from=${weekStart()}&to=${weekEnd()}` : '/admin/pitches',
    [],
    { pollMs: 60_000 },
  );
  const schedule = schedulePitchId ? scheduleState : { ...scheduleState, data: undefined, loading: false };
  const schedulePitch = (data?.pitches ?? []).find((p) => p.id === schedulePitchId) ?? null;

  async function save(pitch: AdminPitchRow, values: PitchFormResult) {
    await api.patch(`/admin/pitches/${pitch.id}`, {
      name: values.name,
      size: values.size,
      surface_type: values.surface_type,
      environment: values.environment,
      hourly_rate: values.hourly_rate,
      is_active: values.is_active,
      ...(values.venue_id && values.venue_id !== pitch.venue_id ? { venue_id: values.venue_id } : {}),
    });
    await reload();
  }

  async function toggleActive(p: AdminPitchRow) {
    setBusyId(p.id);
    try {
      await api.patch(`/admin/pitches/${p.id}`, { is_active: !p.is_active });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnDef<AdminPitchRow>[] = [
    {
      key: 'pitch',
      header: t('thPitch'),
      role: 'identity',
      render: (p) => <span className="font-medium text-gray-900">{p.name}</span>,
      secondary: (p) => `${p.venue_name} · ${p.venue_city}`,
    },
    {
      key: 'rate',
      header: t('thRate'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (p) => formatMoney(p.hourly_rate),
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'meta',
      render: (p) => <StatusBadge status={p.is_active ? 'active' : 'inactive'} />,
    },
    {
      key: 'slots',
      header: t('thSlots'),
      role: 'meta',
      cardLabel: t('thSlots'),
      tabular: true,
      render: (p) => (
        <span dir="ltr">
          {p.slots_booked ?? 0}/{p.slots_total ?? 0}
        </span>
      ),
    },
    {
      key: 'owner',
      header: t('thOwner'),
      role: 'detail',
      render: (p) => (
        <>
          {p.owner_name ?? <span className="text-gray-400">{t('ownerNone')}</span>}
          {p.owner_phone && (
            <span className="ms-2 text-xs text-gray-400" dir="ltr">
              {p.owner_phone}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'size',
      header: t('thSize'),
      role: 'detail',
      render: (p) => <span dir="ltr">{p.size}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="p-8">
        <div className="mb-4 max-w-md">
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:border-brand-500">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('searchPh')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {tc('loading')}
          </div>
        ) : error ? (
          <LoadError error={error} onRetry={reload} className="my-16 self-center" />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.pitches ?? []}
              rowKey={(p) => p.id}
              onRowClick={(p) => setSelected(p)}
              empty={<p className="px-4 py-12 text-center text-sm text-gray-400">{t('empty')}</p>}
            />
            {data && <Pagination page={data.page} perPage={data.perPage} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.pitches"
        title={selected?.name ?? t('thPitch')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thVenue'), value: `${selected.venue_name} · ${selected.venue_city}` },
                {
                  label: t('thOwner'),
                  value: (
                    <>
                      {selected.owner_name ?? t('ownerNone')}
                      {selected.owner_phone && (
                        <span className="ms-2 text-xs text-gray-400" dir="ltr">
                          {selected.owner_phone}
                        </span>
                      )}
                    </>
                  ),
                },
                { label: t('thSize'), value: <span dir="ltr">{selected.size}</span> },
                { label: t('thRate'), value: formatMoney(selected.hourly_rate) },
                {
                  label: t('thSlots'),
                  value: (
                    <span dir="ltr">
                      {selected.slots_booked ?? 0}/{selected.slots_total ?? 0}
                    </span>
                  ),
                },
                { label: t('thStatus'), value: <StatusBadge status={selected.is_active ? 'active' : 'inactive'} /> },
              ]
            : []
        }
        actions={
          selected ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSchedulePitchId(selected.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> {t('scheduleBtn')}
                </button>
                <button
                  onClick={() => toggleActive(selected)}
                  aria-label={selected.is_active ? ts('inactive') : ts('active')}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {selected.is_active ? '−' : '✓'}
                </button>
                <button
                  onClick={() => setEditing(selected)}
                  className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                >
                  {tc('edit')}
                </button>
              </div>
            )
          ) : undefined
        }
      />

      <ScheduleDrawer
        open={!!schedulePitch}
        onClose={() => setSchedulePitchId(null)}
        pitchId={schedulePitch?.id ?? ''}
        pitchName={`${schedulePitch?.name ?? ''} · ${schedulePitch?.venue_name ?? ''}`}
        slots={schedule.data?.slots ?? []}
        loading={schedule.loading}
        onChanged={scheduleState.reload}
        endpointBase="/admin"
      />

      <PitchFormDrawer
        open={!!editing}
        pitch={editing}
        venues={venues.data?.venues ?? null}
        showVenueSelect
        showIsActive
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (!editing) return;
          await save(editing, values);
        }}
      />
    </div>
  );
}
