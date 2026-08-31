'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminTransaction, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';

type TxResponse = ListResponse<AdminTransaction> & { transactions: AdminTransaction[] };

export default function TransactionsPage() {
  const hq = useTranslations('hq');
  const ts = useTranslations('status');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (type) qs.set('type', type);

  const { data, loading, error, reload } = useLiveAdminData<TxResponse>(`/admin/transactions?${qs.toString()}`);

  async function refund(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/transactions/${id}/refund`);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title={hq('transactionsTitle')} subtitle={hq('transactionsSubtitle')} />

      <div className="flex items-center gap-3 px-8 py-4">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{hq('allStatuses')}</option>
          <option value="Pending">{ts('pending')}</option>
          <option value="Completed">{ts('completed')}</option>
          <option value="Failed">{ts('failed')}</option>
          <option value="Reversed">{ts('reversed')}</option>
        </select>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{hq('allTypes')}</option>
          <option value="DEBIT">{hq('typeDebit')}</option>
          <option value="CREDIT">{hq('typeCredit')}</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{hq('loadingTransactions')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">{hq('loadFailed')}: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">{hq('thId')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thUser')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thType')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thAmount')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thReference')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thStatus')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thDate')}</th>
                  <th className="px-4 py-3 font-medium">{hq('thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.transactions ?? []).map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 font-mono text-xs text-gray-600">#{t.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{t.user_name ?? '—'}</div>
                      <div className="text-xs text-gray-500">{t.user_phone ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${t.type === 'CREDIT' ? 'text-green-600' : 'text-gray-700'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(t.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{t.reference_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      {busyId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : t.type === 'DEBIT' && t.status === 'Completed' ? (
                        <button
                          onClick={() => refund(t.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> {hq('refundAction')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
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
