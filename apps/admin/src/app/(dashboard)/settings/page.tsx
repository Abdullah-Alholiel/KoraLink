'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api, type Role } from '@/lib/api';
import { can, getRole } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';

interface SettingsResponse {
  settings: Record<string, unknown>;
}

const KNOWN_SETTINGS: { key: string; labelKey: string; type: 'number' | 'text' }[] = [
  { key: 'platform_margin_sar', labelKey: 'labelPlatformMargin', type: 'number' },
  { key: 'grace_period_mins', labelKey: 'labelGracePeriod', type: 'number' },
  { key: 'payout_cadence_days', labelKey: 'labelPayoutCadence', type: 'number' },
  { key: 'refund_policy', labelKey: 'labelRefundPolicy', type: 'text' },
];

export default function SettingsPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const { data, loading, error, reload, live, stale } = useLiveAdminData<SettingsResponse>('/admin/settings', ['settings']);
  const [values, setValues] = useState<Record<string, string>>({});
  // P2-322: save state is PER-SETTING — saving one key must not flash
  // banners over the other three cards, and a stale "Saved" banner must not
  // survive the next edit of that same field. `savingKey` keeps writes
  // serialized (one at a time) while the spinner shows only on its card.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // RBAC (P2-106): resolve the role once on mount (getRole() reads browser
  // storage — never during render). null = not permitted: inputs stay
  // browsable, only the write affordance is hidden.
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    setRole(getRole());
  }, []);
  const canEdit = can(role, 'settings.edit');

  async function save(key: string, raw: string) {
    setSavingKey(key);
    setSavedKey(null);
    setSaveErrors((e) => ({ ...e, [key]: '' }));
    try {
      const isNumber = KNOWN_SETTINGS.find((s) => s.key === key)?.type === 'number';
      await api.put(`/admin/settings/${key}`, { value: isNumber ? Number(raw) : raw });
      setSavedKey(key);
      reload();
    } catch (e) {
      // What + why + next: the API error text is user-readable (e.g. 403 on a
      // role change); the banner stays on its card until the next attempt or success.
      setSaveErrors((errs) => ({
        ...errs,
        [key]: e instanceof Error ? e.message : ts('failed'),
      }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <PageHeader title={t('settingsTitle')} subtitle={t('settingsSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingSettings')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <div className="max-w-2xl p-8">
          {/* P2-322: socket dropped → values may be aging; pause saves until reconnect. */}
          {stale && (
            <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t('settingsStaleNoSave')}
            </p>
          )}
          <div className="space-y-4">
            {KNOWN_SETTINGS.map((s) => {
              const current =
                values[s.key] !== undefined
                  ? values[s.key]
                  : (data?.settings?.[s.key] === undefined
                      ? ''
                      : String(data.settings[s.key]));
              return (
                <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t(s.labelKey)}</label>
                  <div className="flex items-center gap-2">
                    {s.type === 'text' ? (
                      <textarea
                        value={current}
                        onChange={(e) => {
                          setValues((v) => ({ ...v, [s.key]: e.target.value }));
                          setSavedKey((k) => (k === s.key ? null : k));
                        }}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        rows={3}
                      />
                    ) : (
                      <input
                        type="number"
                        value={current}
                        onChange={(e) => {
                          setValues((v) => ({ ...v, [s.key]: e.target.value }));
                          setSavedKey((k) => (k === s.key ? null : k));
                        }}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    )}
                    {savedKey === s.key && (
                      <span role="status" className="text-xs font-medium text-green-600">
                        {t('savedOk')}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => save(s.key, current)}
                        disabled={stale || savingKey !== null}
                        className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                      >
                        {savingKey === s.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {t('save')}
                      </button>
                    )}
                  </div>
                  {saveErrors[s.key] && (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                      {t('saveFailed', { error: saveErrors[s.key] })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
