'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function initialize(settings: Record<string, unknown>) {
    const next: Record<string, string> = {};
    for (const s of KNOWN_SETTINGS) {
      next[s.key] = settings[s.key] === undefined ? '' : String(settings[s.key]);
    }
    setValues(next);
  }

  async function save(key: string, raw: string) {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const isNumber = KNOWN_SETTINGS.find((s) => s.key === key)?.type === 'number';
      await api.put(`/admin/settings/${key}`, { value: isNumber ? Number(raw) : raw });
      setSaved(true);
      reload();
    } catch (e) {
      // What + why + next: the API error text is user-readable (e.g. 403 on a
      // role change); the banner stays until the next attempt or success.
      setSaveError(e instanceof Error ? e.message : ts('failed'));
    } finally {
      setSaving(false);
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
          {saved && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t('savedOk')}</p>}
          {saveError && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {t('saveFailed', { error: saveError })}
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
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        rows={3}
                      />
                    ) : (
                      <input
                        type="number"
                        value={current}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    )}
                    <button
                      onClick={() => save(s.key, current)}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {t('save')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
