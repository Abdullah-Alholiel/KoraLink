'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import FormField from '@/components/FormField';
import { api } from '@/lib/api';
import type { PartnerVenueRow } from '@/lib/types';

interface VenueFormDrawerProps {
  open: boolean;
  /** Present = edit mode; null = create (name/city/address only). */
  venue?: PartnerVenueRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** Which console surface owns the calls: partner (default) or admin. */
  endpointBase?: '/partner' | '/admin';
}

interface VenueFormValues {
  name: string;
  city: string;
  address: string;
  amenities: string;
  open: string;
  close: string;
  closedDays: boolean[];
}

const EMPTY: VenueFormValues = {
  name: '',
  city: '',
  address: '',
  amenities: '',
  open: '8',
  close: '23',
  closedDays: [false, false, false, false, false, false, false],
};

/**
 * Venue create/edit drawer for the partner portal — labeled fields,
 * amenities hint, operating hours with the P2-31(1) validation moved inside,
 * closed-day toggles. Replaces the old inline panels that shifted the page.
 */
export default function VenueFormDrawer({ open, venue, onClose, onSaved, endpointBase = '/partner' }: VenueFormDrawerProps) {
  const t = useTranslations('venueForm');
  const tp = useTranslations('partner.venues');
  const tc = useTranslations('common');

  const [values, setValues] = useState<VenueFormValues>(EMPTY);
  const [errors, setErrors] = useState<{ name?: string; city?: string; address?: string; hours?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!venue) {
      setValues(EMPTY);
    } else {
      setValues({
        name: venue.name ?? '',
        city: venue.city ?? '',
        address: venue.address ?? '',
        amenities: Array.isArray(venue.amenities) ? (venue.amenities as string[]).join(', ') : '',
        open: String(venue.open_hour ?? 8),
        close: String(venue.close_hour ?? 23),
        closedDays: [
          Boolean(venue.closed_day_0),
          Boolean(venue.closed_day_1),
          Boolean(venue.closed_day_2),
          Boolean(venue.closed_day_3),
          Boolean(venue.closed_day_4),
          Boolean(venue.closed_day_5),
          Boolean(venue.closed_day_6),
        ],
      });
    }
    setErrors({});
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venue?.id]);

  async function submit() {
    const next: typeof errors = {};
    if (!values.name.trim()) next.name = t('fldName');
    if (!values.city.trim()) next.city = t('fldCity');
    if (!values.address.trim()) next.address = t('fldAddress');

    if (venue) {
      const openHour = Number(values.open);
      const closeHour = Number(values.close);
      if (
        Number.isNaN(openHour) ||
        Number.isNaN(closeHour) ||
        openHour < 0 ||
        openHour > 23 ||
        closeHour < 1 ||
        closeHour > 24 ||
        closeHour <= openHour
      ) {
        next.hours = tp('hoursInvalid');
      }
    }

    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (venue) {
        const openHour = Number(values.open);
        const closeHour = Number(values.close);
        await api.patch(`${endpointBase}/venues/${venue.id}`, {
          name: values.name.trim(),
          city: values.city.trim(),
          address: values.address.trim(),
          amenities: values.amenities
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          open_hour: openHour,
          close_hour: closeHour,
          ...Object.fromEntries(values.closedDays.map((closed, day) => [`closed_day_${day}`, closed])),
        });
      } else {
        await api.post(`${endpointBase}/venues`, {
          name: values.name.trim(),
          city: values.city.trim(),
          address: values.address.trim(),
        });
      }
      onSaved();
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
      title={venue ? t('editTitle', { name: venue.name }) : t('createTitle')}
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
            {venue ? tc('saveChanges') : tp('submitForReview')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label={t('fldName')} required error={errors.name}>
          <input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('fldCity')} required error={errors.city}>
            <input
              value={values.city}
              onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </FormField>

          <FormField label={t('fldAddress')} required error={errors.address}>
            <input
              value={values.address}
              onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </FormField>
        </div>

        {venue && (
          <>
            <FormField label={t('fldAmenities')} hint={t('fldAmenitiesHint')}>
              <input
                value={values.amenities}
                onChange={(e) => setValues((v) => ({ ...v, amenities: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </FormField>

            {values.amenities.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {values.amenities
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((a) => (
                    <span key={a} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {a}
                    </span>
                  ))}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center gap-3">
                <FormField label={t('fldOpenHour')} className="w-28">
                  <select
                    value={values.open}
                    onChange={(e) => setValues((v) => ({ ...v, open: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    dir="ltr"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={String(h)}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t('fldCloseHour')} className="w-28">
                  <select
                    value={values.close}
                    onChange={(e) => setValues((v) => ({ ...v, close: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    dir="ltr"
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = i + 1;
                      return (
                        <option key={h} value={String(h)}>
                          {h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}
                        </option>
                      );
                    })}
                  </select>
                </FormField>
              </div>
              {errors.hours && <p className="text-[11px] text-brand-red">{errors.hours}</p>}
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-gray-700">{t('fldClosedDays')}</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <label key={day} className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={values.closedDays[day]}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          closedDays: v.closedDays.map((c, i) => (i === day ? e.target.checked : c)),
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    {tp(`closedDay${day}`)}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
      </div>
    </Drawer>
  );
}
