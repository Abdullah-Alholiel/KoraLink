'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CheckCircle2, Loader2, TimerOff, ChevronDown } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminUser } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

const ROLES: AdminUser['role'][] = ['Player', 'VenueOwner', 'Admin'];

function userStatus(u: AdminUser): string {
  if (u.banned_at) return 'banned';
  if (u.suspended_until && new Date(u.suspended_until).getTime() > Date.now()) return 'suspended';
  return 'active';
}

export default function UserDetailPage() {
  const t = useTranslations('hq');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const { data, loading, error, reload } = useLiveAdminData<AdminUser>(`/admin/users/${id}`);
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.patch(`/admin/users/${id}`, body);
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="User" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="User" />
        <div className="p-8 text-sm text-red-600">{t('loadFailed')}: {error}</div>
      </div>
    );
  }

  const st = userStatus(data);
  const busyState = busy;
  const rows: [string, React.ReactNode][] = [
    ['Phone', data.phone],
    ['Handle', data.handle ? `@${data.handle}` : '—'],
    [
      'Role',
      (
        <div className="relative inline-flex">
          <select
            value={data.role}
            onChange={(e) => act({ role: e.target.value as AdminUser['role'] })}
            disabled={busyState}
            className="appearance-none rounded-lg border border-gray-300 bg-white py-1 pe-7 ps-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      ),
    ],
    ['Wallet', formatMoney(data.wallet_balance)],
    ['Karma', String(data.karma_score)],
    ['Rating', String(data.rating)],
    ['No-shows', String(data.no_show_count)],
    ['Matches played', String(data.matchesPlayed ?? 0)],
    ['Total spent', formatMoney(data.totalSpent ?? 0)],
    ['Verification', data.verification_status],
    ['Joined', formatDate(data.created_at)],
    ['Last seen', formatDate(data.last_seen_at)],
  ];

  return (
    <div>
      <PageHeader
        title={data.full_name ?? 'User'}
        subtitle={`#${id.slice(0, 8).toUpperCase()}`}
        actions={
          <button onClick={() => router.push('/users')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to users
          </button>
        }
      />

      <div className="max-w-2xl p-8">
        <div className="mb-6">
          <StatusBadge status={st} />
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="mt-0.5 text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-gray-400">
          Changing the role takes effect on the user's next sign-in (the JWT carries the role claim).
        </p>

        <div className="mt-6 flex items-center gap-3">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <>
              {st === 'banned' ? (
                <button
                  onClick={() => act({ banned: false })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <CheckCircle2 className="h-4 w-4" /> Unban
                </button>
              ) : (
                <button
                  onClick={() => act({ banned: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <Ban className="h-4 w-4" /> Ban
                </button>
              )}
              {st === 'suspended' ? (
                <button
                  onClick={() => act({ suspendedUntil: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  Lift suspension
                </button>
              ) : (
                <button
                  onClick={() => act({ suspendedUntil: new Date(Date.now() + 7 * 86400000).toISOString() })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <TimerOff className="h-4 w-4" /> Suspend 7d
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
