'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { PartnerPitch, PartnerSlot, PartnerVenueRow } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import PitchFormDrawer, { type PitchFormResult } from '@/components/PitchFormDrawer';
import ScheduleDrawer from '@/components/ScheduleDrawer';
import ConfirmDialog from '@/components/ConfirmDialog';

/** Enriched slot bundle fetched per pitch when its schedule drawer opens. */
interface SlotsResponse {
  slots: PartnerSlot[];
}

export default function MyPitchesPage() {
  const t = useTranslations('partner.pitches');
  const tc = useTranslations('common');
  const { data, loading, error, reload } = useLiveAdminData<PartnerPitch[]>('/partner/pitches', ['venues']);
  const venues = useLiveAdminData<PartnerVenueRow[]>('/partner/venues', ['venues']);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PartnerPitch | null>(null);
  const [schedulePitchId, setSchedulePitchId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PartnerPitch | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Deep-link support: /partner/pitches?schedule=<pitchId> opens the drawer.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('schedule');
    if (id) setSchedulePitchId(id);
  }, []);

  const scheduleState = useLiveAdminData<SlotsResponse>(
    schedulePitchId ? `/partner/pitches/${schedulePitchId}/slots?from=${weekStart()}&to=${weekEnd()}` : '/partner/pitches',
    [],
    { pollMs: 60_000 },
  );
  // Only fetch when a schedule drawer is open.
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

  async function toggleActive(p: PartnerPitch) {
    setBusyId(p.id);
    try {
      await api.patch(`/partner/pitches/${p.id}`, { is_active: !p.is_active });
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function createPitch(values: PitchFormResult) {
    setFormError(null);
    try {
      await api.post('/partner/pitches', values);
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('createFailed'));
      throw e; // keep the drawer open so the partner sees the error
    }
  }

  async function savePitch(pitchId: string, values: PitchFormResult) {
    await api.patch(`/partner/pitches/${pitchId}`, {
      name: values.name,
      size: values.size,
      surface_type: values.surface_type,
      environment: values.environment,
      hourly_rate: values.hourly_rate,
    });
    reload();
  }

  async function deletePitch(p: PartnerPitch) {
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
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t('addNewPitch')}
          </button>
        }
      />

      <div className="space-y-6 p-8">
        {/* Create drawer */}
        <PitchFormDrawer
          open={creating}
          pitch={null}
          venues={(venues.data ?? []).map((v) => ({ id: v.id, name: v.name, city: v.city }))}
          showVenueSelect
          onClose={() => {
            setCreating(false);
            setFormError(null);
          }}
          onSubmit={createPitch}
        />
        {formError && creating && <p className="text-sm text-brand-red">{formError}</p>}

        {/* Edit drawer */}
        <PitchFormDrawer
          open={!!editing}
          pitch={editing}
          venues={(venues.data ?? []).map((v) => ({ id: v.id, name: v.name, city: v.city }))}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            if (!editing) return;
            await savePitch(editing.id, values);
          }}
        />

        {/* Schedule slide-over */}
        <ScheduleDrawer
          open={!!schedulePitch}
          onClose={() => setSchedulePitchId(null)}
          pitchId={schedulePitch?.id ?? ''}
          pitchName={`${schedulePitch?.name ?? ''} · ${schedulePitch?.venue_name ?? ''}`}
          slots={schedule.data?.slots ?? []}
          loading={schedule.loading}
          onChanged={scheduleState.reload}
        />

        {/* Pitch cards */}
        {loading ? (
          <div className="py-10 text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="py-10 text-sm text-brand-red">{t('error', { error })}</div>
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
                      onClick={() => setSchedulePitchId(p.id)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      <Zap className="h-4 w-4" /> {t('manageSchedule')}
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
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <Pencil className="h-3.5 w-3.5" /> {tc('edit')}
                        </span>
                      </button>
                      <button
                        onClick={() => setDeleting(p)}
                        disabled={busy}
                        className="rounded-lg border border-red-200 px-2.5 py-2 text-brand-red hover:bg-red-50 disabled:opacity-50"
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

      <ConfirmDialog
        open={!!deleting}
        title={t('deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={tc('delete')}
        danger
        onConfirm={() => {
          if (deleting) void deletePitch(deleting);
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
