'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminPitchList, AdminPitchRow } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import PitchFormDrawer from '@/components/PitchFormDrawer';
import type { PitchFormResult } from '@/components/PitchFormDrawer';

/**
 * HQ pitch management (admin-ux-overhaul slice 2): every pitch across all
 * venues with owner resolution, search, and admin edit (rate, size, active,
 * cross-venue move = effective ownership hand-off for pitches).
 */
export default function AdminPitchesPage() {
  const t = useTranslations('adminPitches');
  const tc = useTranslations('common');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminPitchRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {tc('loading')}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-brand-red">
              {tc('failedToLoad', { error })}
              <button onClick={reload} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                {tc('retry')}
              </button>
            </div>
          ) : (
            <>
              <table className="w-full text-start text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t('thPitch')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thVenue')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thOwner')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thSize')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thRate')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thSlots')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('thStatus')}</th>
                    <th className="px-4 py-3 text-end font-medium">{tc('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.pitches ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.venue_name}
                        <span className="block text-xs text-gray-400">{p.venue_city}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.owner_name ?? <span className="text-gray-400">{t('ownerNone')}</span>}
                        {p.owner_phone && (
                          <span className="block text-xs text-gray-400" dir="ltr">
                            {p.owner_phone}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700" dir="ltr">{p.size}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(p.hourly_rate)}</td>
                      <td className="px-4 py-3 text-gray-700" dir="ltr">
                        {p.slots_booked ?? 0}/{p.slots_total ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {busyId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : p.is_active ? (
                              '−'
                            ) : (
                              '✓'
                            )}
                          </button>
                          <button
                            onClick={() => setEditing(p)}
                            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                          >
                            {tc('edit')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data?.pitches.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                        {t('empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {data && <Pagination page={data.page} perPage={data.perPage} total={data.total} onPage={setPage} />}
            </>
          )}
        </div>
      </div>

      <PitchFormDrawer
        open={!!editing}
        pitch={editing}
        allowVenueMove
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (!editing) return;
          await save(editing, values);
        }}
      />
    </div>
  );
}
