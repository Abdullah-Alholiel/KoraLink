'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Search, UserCog, XCircle } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminVenue, ListResponse } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import VenueTransferDrawer from '@/components/VenueTransferDrawer';

type VenuesResponse = ListResponse<AdminVenue> & { venues: AdminVenue[] };

export default function VenuesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<AdminVenue | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  if (status !== 'all') qs.set('status', status);

  const { data, loading, error, reload } = useLiveAdminData<VenuesResponse>(`/admin/venues?${qs.toString()}`);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusyId(id);
    try {
      await api.post(`/admin/venues/${id}/decision`, { decision });
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Venues & Pitches" subtitle="Directory and approval queue" />

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
              placeholder="Search venue, city, owner"
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
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">Loading venues…</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load venues: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Pitches</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Approved</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.venues ?? []).map((v) => {
                  const busy = busyId === v.id;
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-8 py-3">
                        <Link href={`/venues/${v.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                          {v.name}
                        </Link>
                        <div className="text-xs text-gray-500">{v.address}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{v.city}</td>
                      <td className="px-4 py-3 text-gray-700">{v.owner_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{v.pitch_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.verification_status ?? 'pending'} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.is_approved ? 'approved' : 'pending'} />
                      </td>
                      <td className="px-4 py-3">
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {!v.is_approved && (
                              <>
                                <button
                                  onClick={() => decide(v.id, 'approve')}
                                  className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                </button>
                                <button
                                  onClick={() => decide(v.id, 'reject')}
                                  className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                  <XCircle className="h-3.5 w-3.5" /> Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setTransferring(v)}
                              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
                            >
                              <UserCog className="h-3.5 w-3.5" /> Transfer
                            </button>
                          </div>
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

      <VenueTransferDrawer
        venue={transferring}
        onClose={() => setTransferring(null)}
        onSaved={reload}
      />
    </div>
  );
}
