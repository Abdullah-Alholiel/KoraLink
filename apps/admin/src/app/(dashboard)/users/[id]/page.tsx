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
import ConfirmDialog from '@/components/ConfirmDialog';

const ROLES: AdminUser['role'][] = ['Player', 'VenueOwner', 'Admin'];
// P1-53 (run #62): suspension presets in hours (24h / 7d / 30d).
const SUSPEND_PRESETS_HOURS = [24, 168, 720] as const;

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
  // Run #62 (P1-53): action failures surface inline (never silent); ban and
  // suspension changes are gated behind confirmation / a duration choice.
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);
  const [suspendMenu, setSuspendMenu] = useState(false);

  async function act(body: Record<string, unknown>) {
    if (busy) return; // re-entry guard: menu buttons aren't disabled mid-save
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/admin/users/${id}`, body);
      reload();
    } catch (e) {
      // Localized headline + raw backend text demoted to a muted LTR detail
      // line (LoadError pattern); never silent (error-message standard).
      setActionError(e instanceof Error ? e.message : '');
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

        {actionError && (
          <div role="alert" className="mt-4">
            <p className="text-sm font-medium text-brand-red">{t('actionFailed')}</p>
            {actionError && (
              <p dir="ltr" className="mt-0.5 text-xs text-gray-400 break-words">
                {actionError}
              </p>
            )}
          </div>
        )}

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
                  onClick={() => setConfirmBan(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <Ban className="h-4 w-4" /> {t('ban')}
                </button>
              )}
              {st === 'suspended' ? (
                <>
                  <button
                    onClick={() => setSuspendMenu(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                  >
                    <TimerOff className="h-4 w-4" /> {t('extendSuspension')}
                  </button>
                  <button
                    onClick={() => act({ suspendedUntil: null })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                  >
                    {t('liftSuspension')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSuspendMenu(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <TimerOff className="h-4 w-4" /> {t('suspendBtn')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* P1-53 (run #62): a ban is the highest blast-radius action on this
          page — name the target before it happens (P1-52 parity). */}
      <ConfirmDialog
        open={confirmBan}
        title={t('banConfirmTitle')}
        message={t('banConfirmUser', { user: data.full_name ?? data.phone })}
        confirmLabel={t('ban')}
        danger
        onConfirm={() => {
          setConfirmBan(false);
          act({ banned: true });
        }}
        onClose={() => setConfirmBan(false)}
      />

      {/* P1-53 (run #62): suspension duration presets (24h/7d/30d). Replaces
          the hardcoded 7d-only preset; also reachable while suspended as an
          extend action (lift stays separate). */}
      {suspendMenu && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('suspendBtn')}
        >
          <div
            className="absolute inset-0 bg-black/40 animate-[fade-in_.15s_ease-out]"
            onClick={() => setSuspendMenu(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('suspendMenuTitle', { user: data.full_name ?? data.phone })}
            </h3>
            <div className="mt-4 grid gap-2">
              {SUSPEND_PRESETS_HOURS.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setSuspendMenu(false);
                    act({ suspendedUntil: new Date(Date.now() + h * 3_600_000).toISOString() });
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-amber-50 hover:border-amber-200"
                >
                  {t(`suspendPreset${h}h`)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSuspendMenu(false)}
              className="mt-4 w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {t('suspendCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
