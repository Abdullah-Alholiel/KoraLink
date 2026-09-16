'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CheckCircle2, Loader2, TimerOff, ChevronDown } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
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

/**
 * User detail + moderation surface. P2-67 (run #54): the page was the last
 * English-only detail surface — title, loading, all 12 field labels, back link,
 * role note and every action button shipped hardcoded English, breaking the AR
 * console on one of the highest-stakes admin operations (ban/suspend). All copy
 * now routes through the `userDetail` namespace (+ common.loading / nav for
 * back — mirroring the P2-61 venues/[id] pattern, including the RTL-mirrored
 * back arrow). Verification status keeps flowing through StatusBadge's `status`
 * catalog (localized + safe fallback for unknown enums). Field VALUES are the
 * user's data (phone/handle/dates via formatDate, money via formatMoney) —
 * only labels are catalog-driven.
 */
export default function UserDetailPage() {
  const t = useTranslations('userDetail');
  const tHQ = useTranslations('hq');
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
        <PageHeader title={t('titleFallback')} subtitle={t('loading')} />
        <div className="p-8 text-sm text-gray-500">{t('loading')}</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title={t('titleFallback')} />
        <LoadError error={error} onRetry={reload} className="m-8" />
      </div>
    );
  }

  const st = userStatus(data);
  const busyState = busy;
  const rows: [string, React.ReactNode][] = [
    [
      'phone',
      data.phone,
    ],
    [
      'handle',
      data.handle ? `@${data.handle}` : t('na'),
    ],
    [
      'role',
      (
        <div className="relative inline-flex">
          <select
            value={data.role}
            onChange={(e) => act({ role: e.target.value as AdminUser['role'] })}
            disabled={busyState}
            aria-label={t('field_role')}
            className="appearance-none rounded-lg border border-gray-300 bg-white py-1 pe-7 ps-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tHQ(`role${r}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      ),
    ],
    ['wallet', formatMoney(data.wallet_balance)],
    ['karma', String(data.karma_score)],
    ['rating', String(data.rating)],
    ['noShows', String(data.no_show_count)],
    ['matchesPlayed', String(data.matchesPlayed ?? 0)],
    ['totalSpent', formatMoney(data.totalSpent ?? 0)],
    ['verification', <StatusBadge status={data.verification_status} />],
    ['joined', formatDate(data.created_at)],
    ['lastSeen', formatDate(data.last_seen_at)],
  ];

  return (
    <div>
      <PageHeader
        title={data.full_name ?? t('titleFallback')}
        subtitle={`#${id.slice(0, 8).toUpperCase()}`}
        actions={
          <button onClick={() => router.push('/users')} className="text-sm text-gray-500 hover:text-gray-700">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t('backToUsers')}
          </button>
        }
      />

      <div className="max-w-2xl p-8">
        <div className="mb-6">
          <StatusBadge status={st} />
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 text-sm">
          {rows.map(([key, v]) => (
            <div key={key}>
              <dt className="text-xs text-gray-500">{t(`field_${key}`)}</dt>
              <dd className="mt-0.5 text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-gray-400">{t('roleNote')}</p>

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
                  <CheckCircle2 className="h-4 w-4" /> {t('unban')}
                </button>
              ) : (
                <button
                  onClick={() => act({ banned: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <Ban className="h-4 w-4" /> {t('ban')}
                </button>
              )}
              {st === 'suspended' ? (
                <button
                  onClick={() => act({ suspendedUntil: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  {t('liftSuspension')}
                </button>
              ) : (
                <button
                  onClick={() => act({ suspendedUntil: new Date(Date.now() + 7 * 86400000).toISOString() })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <TimerOff className="h-4 w-4" /> {t('suspend7d')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
