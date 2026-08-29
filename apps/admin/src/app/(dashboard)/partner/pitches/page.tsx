'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { PartnerPitch, PartnerSlot, PartnerVenueRow } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import EditPitchSheet from '@/components/EditPitchSheet';
import SlotManager from '@/components/SlotManager';

/** Enriched slot bundle fetched per pitch when its schedule is expanded. */
interface SlotsResponse {
  slots: PartnerSlot[];
}

export default function MyPitchesPage() {
  const t = useTranslations('partner.pitches');
  const tc = useTranslations('common');
  const { data, loading, error, reload } = useLiveAdminData<PartnerPitch[]>('/partner/pitches', ['venues']);
  const venues = useLiveAdminData<PartnerVenueRow[]>('/partner/venues', ['venues']);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PartnerPitch | null>(null);
  const [schedulePitchId, setSchedulePitchId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const scheduleState = useLiveAdminData<SlotsResponse>(
    schedulePitchId ? `/partner/pitches/${schedulePitchId}/slots?from=${weekStart()}&to=${weekEnd()}` : '/partner/pitches',
    [],
    { pollMs: 60_000 },
  );
  // Only fetch when a schedule is open — reuse of the hook requires a valid path.
  const schedule = schedulePitchId ? scheduleState : { ...scheduleState, data: undefined, loading: false };

  const schedulePitch = (data ?? []).find((p) => p.id === schedulePitchId) ?? null;

  function weekStart(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return d.toISOString().slice(0, 10);
  }
  function weekEnd(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6);
    return d.toISOString().slice(0, 10);
  }

  const [form, setForm] = useState({
    venue_id: '',
    name: '',
    size: '5v5',
    surface_type: 'Artificial',
    environment: 'Outdoor',
    hourly_rate: 300,
  });

  async function toggleActive(p: PartnerPitch) {
    setBusyId(p.id);
    try {
      await api.patch(`/partner/pitches/${p.id}`, { is_active: !p.is_active });
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function addPitch() {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/partner/pitches', form);
      setShowForm(false);
      setForm((f) => ({ ...f, name: '' }));
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function savePitch(pitchId: string, values: { name: string; size: string; surface_type: string; environment: string; hourly_rate: number }) {
    await api.patch(`/partner/pitches/${pitchId}`, values);
    reload();
  }

  async function deletePitch(p: PartnerPitch) {
    if (!window.confirm(t('deleteConfirm', { name: p.name }))) return;
    setBusyId(p.id);
    try {
      await api.delete(`/partner/pitches/${p.id}`);
      if (schedulePitchId === p.id) setSchedulePitchId(null);
      reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? tc('cancel') : t('addNewPitch')}
          </button>
        }
      />

      <div className="space-y-6 p-8">
        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('addNewTitle')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <select
                value={form.venue_id}
                onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">{t('selectVenue')}</option>
                {(venues.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('phPitchName')}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {['5v5', '7v7', '8v8', '11v11'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={form.surface_type} onChange={(e) => setForm((f) => ({ ...f, surface_type: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="Artificial">{t('surfaceArtificial')}</option>
                <option value="Grass">{t('surfaceGrass')}</option>
              </select>
              <select value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="Outdoor">{t('envOutdoor')}</option>
                <option value="Indoor">{t('envIndoor')}</option>
              </select>
              <input
                type="number"
                value={form.hourly_rate}
                onChange={(e) => setForm((f) => ({ ...f, hourly_rate: Number(e.target.value) }))}
                placeholder={t('phHourlyRate')}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <button
              onClick={addPitch}
              disabled={saving || !form.venue_id || !form.name}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('createPitch')}
            </button>
          </div>
        )}

        {/* Edit sheet */}
        <EditPitchSheet pitch={editing} onClose={() => setEditing(null)} onSave={savePitch} />

        {/* Schedule manager (expanded under its pitch) */}
        {schedulePitch && (
          <SlotManager
            pitchId={schedulePitch.id}
            pitchName={`${schedulePitch.name} · ${schedulePitch.venue_name ?? ''}`}
            slots={schedule.data?.slots ?? []}
            loading={schedule.loading}
            onChanged={scheduleState.reload}
          />
        )}

        {/* Pitch cards */}
        {loading ? (
          <div className="py-10 text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="py-10 text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((p) => {
              const busy = busyId === p.id;
              return (
                <div key={p.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.venue_name ?? '—'}</div>
                    </div>
                    <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-gray-500">{t('size')}</dt>
                      <dd className="text-gray-900" dir="ltr">{p.size}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">{t('surface')}</dt>
                      <dd className="text-gray-900">{p.surface_type === 'Artificial' ? t('surfaceArtificial') : p.surface_type === 'Grass' ? t('surfaceGrass') : p.surface_type}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">{t('environment')}</dt>
                      <dd className="text-gray-900">{p.environment === 'Outdoor' ? t('envOutdoor') : p.environment === 'Indoor' ? t('envIndoor') : p.environment}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">{t('hourlyRate')}</dt>
                      <dd className="text-gray-900">{formatMoney(p.hourly_rate)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto space-y-2 pt-4">
                    <button
                      onClick={() => setSchedulePitchId(schedulePitchId === p.id ? null : p.id)}
                      className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                        schedulePitchId === p.id
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-brand-600 text-white hover:bg-brand-700'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Zap className="h-4 w-4" />
                        {schedulePitchId === p.id ? t('closeSchedule') : t('manageSchedule')}
                      </span>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleActive(p)}
                        disabled={busy}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : p.is_active ? t('setUnavailable') : t('setAvailable')}
                      </button>
                      <button
                        onClick={() => setEditing(editing?.id === p.id ? null : p)}
                        className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
                      >
                        <span className="inline-flex items-center justify-center gap-1.5 w-full">
                          <Pencil className="h-3.5 w-3.5" /> {tc('edit')}
                        </span>
                      </button>
                      <button
                        onClick={() => deletePitch(p)}
                        disabled={busy}
                        className="rounded-lg border border-red-200 px-2.5 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label={t('deletePitchAria')}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!data?.length && <div className="text-sm text-gray-400">{t('empty')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
