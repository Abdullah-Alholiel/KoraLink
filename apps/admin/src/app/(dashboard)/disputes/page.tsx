'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { DisputeListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';

type DisputesResponse = ListResponse<DisputeListItem> & { disputes: DisputeListItem[] };

export default function DisputesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);

  const { data, loading, error } = useLiveAdminData<DisputesResponse>(`/admin/disputes?${qs.toString()}`);

  return (
    <div>
      <PageHeader title={t('disputesTitle')} subtitle={t('disputesSubtitle')} />

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
          <option value="opened">{ts('opened')}</option>
          <option value="under_review">{ts('under_review')}</option>
          <option value="resolved">{ts('resolved')}</option>
          <option value="rejected">{ts('rejected')}</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingDisputes')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load disputes: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">{t('thDispute')}</th>
                  <th className="px-4 py-3 font-medium">{t('thType')}</th>
                  <th className="px-4 py-3 font-medium">{t('thReporter')}</th>
                  <th className="px-4 py-3 font-medium">{t('thRespondent')}</th>
                  <th className="px-4 py-3 font-medium">{t('thMatch')}</th>
                  <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                  <th className="px-4 py-3 font-medium">{ts('opened')}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.disputes ?? []).map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 font-mono text-xs text-gray-600">#{d.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-3 text-gray-700">{d.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-700">{d.reporter_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{d.respondent_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{d.match_title ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(d.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/disputes/${d.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
