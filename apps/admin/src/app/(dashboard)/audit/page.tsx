'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { AuditLog, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';

type AuditResponse = ListResponse<AuditLog> & { logs: AuditLog[] };

export default function AuditPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), perPage: '50' });

  const { data, loading, error } = useLiveAdminData<AuditResponse>(`/admin/audit-logs?${qs.toString()}`);

  return (
    <div>
      <PageHeader title={t('auditTitle')} subtitle={t('auditSubtitle')} />

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingAudit')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">{t('loadFailed')}: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">{t('thTime')}</th>
                  <th className="px-4 py-3 font-medium">{t('roleAdmin')}</th>
                  <th className="px-4 py-3 font-medium">{t('thAction')}</th>
                  <th className="px-4 py-3 font-medium">{t('thEntity')}</th>
                  <th className="px-4 py-3 font-medium">{t('thEntityId')}</th>
                  <th className="px-4 py-3 font-medium">{t('thIp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.logs ?? []).map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 text-gray-500">{formatDate(l.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900">{l.admin_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{l.entity_type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.entity_id ? l.entity_id.slice(0, 8) : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{l.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={50} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
