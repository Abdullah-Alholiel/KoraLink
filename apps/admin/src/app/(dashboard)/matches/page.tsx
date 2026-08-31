'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Ban, Loader2, Pencil } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminMatch, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import MatchEditDrawer from '@/components/MatchEditDrawer';

type MatchesResponse = ListResponse<AdminMatch> & { matches: AdminMatch[] };

const TERMINAL = new Set(['Completed', 'Cancelled']);

export default function MatchesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMatch | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);

  const { data, loading, error, reload } = useLiveAdminData<MatchesResponse>(`/admin/matches?${qs.toString()}`);

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/matches/${id}/cancel`);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title={t('matchesTitle')} subtitle={t('matchesSubtitle')} />

      <div className="flex items-center gap-3 px-8 py-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="Open">{ts('open')}</option>
          <option value="Full">{ts('full')}</option>
          <option value="InProgress">{ts('inprogress')}</option>
          <option value="Completed">{ts('completed')}</option>
          <option value="Cancelled">{ts('cancelled')}</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingMatches')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">{t('thMatch')}</th>
                  <th className="px-4 py-3 font-medium">{t('thHost')}</th>
                  <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                  <th className="px-4 py-3 font-medium">{t('thScheduled')}</th>
                  <th className="px-4 py-3 font-medium">{t('thSpots')}</th>
                  <th className="px-4 py-3 font-medium">{t('thPrice')}</th>
                  <th className="px-4 py-3 font-medium">{t('thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.matches ?? []).map((m) => {
                  const busy = busyId === m.id;
                  const terminal = TERMINAL.has(m.status);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-8 py-3">
                        <div className="font-medium text-gray-900">{m.title}</div>
                        <div className="text-xs text-gray-500">
                          {m.venue_name} · {m.pitch_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{m.host_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(m.scheduled_at)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {m.spots_filled}/{m.max_players}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(m.price_per_player)}</td>
                      <td className="px-4 py-3">
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : !terminal ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditing(m)}
                              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
                            >
                              <Pencil className="h-3.5 w-3.5" /> {t('editAction')}
                            </button>
                            <button
                              onClick={() => cancel(m.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              <Ban className="h-3.5 w-3.5" /> {t('cancelAction')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <MatchEditDrawer match={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
