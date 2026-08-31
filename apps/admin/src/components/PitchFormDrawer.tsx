'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import FormField from '@/components/FormField';
import { api } from '@/lib/api';
import type { AdminVenueListRow } from '@/lib/types';

export interface PitchFormValues {
  venue_id: string;
  name: string;
  size: string;
  surface_type: string;
  environment: string;
  hourly_rate: number;
  is_active: boolean;
}

export interface PitchFormResult {
  venue_id: string;
  name: string;
  size: string;
  surface_type: string;
  environment: string;
  hourly_rate: number;
  is_active?: boolean;
}

interface PitchFormDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Present = edit mode (admin PATCH); absent = create mode. */
  pitch?: {
    id: string;
    name: string;
    size: string;
    surface_type: string;
    environment: string;
    hourly_rate: number | string;
    is_active: boolean;
    venue_id?: string;
  } | null;
  /** Admin mode adds the venue selector (cross-venue move / ownership hand-off). */
  allowVenueMove?: boolean;
  onSubmit: (values: PitchFormResult) => Promise<void>;
}

const SIZES = ['5v5', '7v7', '8v8', '11v11'] as const;

/**
 * Create/edit pitch form inside a Drawer — labeled fields, validation,
 * live price preview, proper busy state. Shared by the partner My Pitches
 * page (create + edit) and the admin Pitches page (edit + venue move).
 */
export default function PitchFormDrawer({ open, onClose, pitch, allowVenueMove, onSubmit }: PitchFormDrawerProps) {
  const t = useTranslations('pitchForm');
  const tc = useTranslations('common');
  const venues = useLiveVenues(open);

  const [values, setValues] = useState<PitchFormValues>(() => defaults(pitch));
  const [errors, setErrors] = useState<{ name?: string; venue_id?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed the form whenever the drawer opens for a different pitch.
  useEffect(() => {
    if (open) {
      setValues(defaults(pitch));
      setErrors({});
      setSaveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pitch?.id]);

  async function submit() {
    const next: { name?: string; venue_id?: string } = {};
    if (!values.name.trim()) next.name = t('nameRequired');
    if (allowVenueMove && !values.venue_id) next.venue_id = t('venueRequired');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setSaveError(null);
    try {
      const payload: PitchFormResult = {
        venue_id: values.venue_id,
        name: values.name.trim(),
        size: values.size,
        surface_type: values.surface_type,
        environment: values.environment,
        hourly_rate: values.hourly_rate,
      };
      // is_active is admin-editable; in create mode the API defaults it.
      if (pitch) payload.is_active = values.is_active;
      await onSubmit(payload);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={pitch ? t('editTitle', { name: pitch.name }) : t('createTitle')}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {tc('cancel')}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {pitch ? tc('saveChanges') : t('submitCreate')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {allowVenueMove && (
          <FormField label={t('fldVenue')} required error={errors.venue_id}>
            <select
              value={values.venue_id}
              onChange={(e) => setValues((v) => ({ ...v, venue_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">—</option>
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.city}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label={t('fldName')} required error={errors.name}>
          <input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('fldSize')}>
            <select
              value={values.size}
              onChange={(e) => setValues((v) => ({ ...v, size: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              dir="ltr"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t('fldRate')}>
            <input
              type="number"
              min={0}
              value={values.hourly_rate}
              onChange={(e) => setValues((v) => ({ ...v, hourly_rate: Number(e.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              dir="ltr"
            />
          </FormField>

          <FormField label={t('fldSurface')}>
            <select
              value={values.surface_type}
              onChange={(e) => setValues((v) => ({ ...v, surface_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="Artificial">Artificial</option>
              <option value="Grass">Grass</option>
            </select>
          </FormField>

          <FormField label={t('fldEnvironment')}>
            <select
              value={values.environment}
              onChange={(e) => setValues((v) => ({ ...v, environment: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="Outdoor">Outdoor</option>
              <option value="Indoor">Indoor</option>
            </select>
          </FormField>
        </div>

        {pitch && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            {t('fldActive')}
          </label>
        )}

        {/* Live price preview — instant feedback on the field partners care most about. */}
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
          {t('ratePreview', { amount: String(values.hourly_rate) })}
        </p>

        {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
      </div>
    </Drawer>
  );
}

function defaults(pitch: PitchFormDrawerProps['pitch']) {
  return {
    venue_id: pitch?.venue_id ?? '',
    name: pitch?.name ?? '',
    size: pitch?.size ?? '5v5',
    surface_type: pitch?.surface_type ?? 'Artificial',
    environment: pitch?.environment ?? 'Outdoor',
    hourly_rate: Number(pitch?.hourly_rate ?? 300),
    is_active: pitch?.is_active ?? true,
  };
}

/** Fetch the venue options only while the drawer is open. */
function useLiveVenues(enabled: boolean): AdminVenueListRow[] | null {
  const [venues, setVenues] = useState<AdminVenueListRow[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .get<{ venues: AdminVenueListRow[] }>('/admin/venues?perPage=100')
      .then((res) => {
        if (!cancelled) setVenues(res.venues);
      })
      .catch(() => {
        if (!cancelled) setVenues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return venues;
}
