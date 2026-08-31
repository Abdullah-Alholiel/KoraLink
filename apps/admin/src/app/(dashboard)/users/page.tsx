'use client';

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

type UsersResponse = ListResponse<AdminUser> & { users: AdminUser[] };

function userStatus(u: AdminUser): string {
  if (u.banned_at) return 'banned';
  if (u.suspended_until && new Date(u.suspended_until).getTime() > Date.now()) return 'suspended';
  return 'active';
}

export default function UsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (search) qs.set('search', search);
  if (role) qs.set('role', role);
  if (status && status !== 'all') qs.set('status', status);

  const { data, loading, error, reload } = useLiveAdminData<UsersResponse>(`/admin/users?${qs.toString()}`);

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await api.patch(`/admin/users/${id}`, body);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage players, venue owners, and admins" />

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
              placeholder="Search name, phone, handle"
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
          <option value="">All roles</option>
          <option value="Player">Player</option>
          <option value="VenueOwner">Venue Owner</option>
          <option value="Admin">Admin</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">Loading users…</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load users: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Wallet</th>
                  <th className="px-4 py-3 font-medium">Karma</th>
                  <th className="px-4 py-3 font-medium">No-shows</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.users ?? []).map((u) => {
                  const st = userStatus(u);
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-8 py-3">
                        <Link href={`/users/${u.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                          {u.full_name ?? '—'}
                        </Link>
                        <div className="text-xs text-gray-500">@{u.handle ?? 'no-handle'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                      <td className="px-4 py-3">
                        <span className="text-gray-700">{u.role}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(u.wallet_balance)}</td>
                      <td className="px-4 py-3 text-gray-700">{u.karma_score}</td>
                      <td className="px-4 py-3 text-gray-700">{u.no_show_count}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={st} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : (
                            <>
                              {st === 'banned' ? (
                                <button
                                  onClick={() => act(u.id, { banned: false })}
                                  className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Unban
                                </button>
                              ) : (
                                <button
                                  onClick={() => act(u.id, { banned: true })}
                                  className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                  <Ban className="h-3.5 w-3.5" /> Ban
                                </button>
                              )}
                              {st === 'suspended' ? (
                                <button
                                  onClick={() => act(u.id, { suspendedUntil: null })}
                                  className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                >
                                  Lift
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    act(u.id, {
                                      suspendedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                                >
                                  <TimerOff className="h-3.5 w-3.5" /> Suspend 7d
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
    </div>
  );
}
