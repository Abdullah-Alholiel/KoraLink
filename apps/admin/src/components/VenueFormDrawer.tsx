'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import FormField from '@/components/FormField';
import { api, ApiError } from '@/lib/api';
import type { PartnerVenueRow } from '@/lib/types';

/** Mirrors the API cap (media.service.ts MAX_VENUE_IMAGES). */
const MAX_IMAGES = 6;
/** Where the API serves these images from (public media route). */
const API_ORIGIN =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1$/, '');

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
  /** P1-38: photo paths (/media/venues/...) — display order. */
  images: string[];
}

const EMPTY: VenueFormValues = {
  name: '',
  city: '',
  address: '',
  amenities: '',
  open: '8',
  close: '23',
  closedDays: [false, false, false, false, false, false, false],
  images: [],
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
  // P1-38: photo upload state (edit mode only — a venue id is required by the API).
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        images: Array.isArray(venue.images) ? (venue.images as string[]) : [],
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
          // P1-38: current order after any add/remove (server dedupes + validates).
          images: values.images,
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

  /** P1-38: upload one photo; the API appends the canonical path server-side. */
  async function handleFilesSelected(files: FileList | null) {
    if (!venue || !files?.length) return;
    setUploadError(null);
    setUploading(true);
    // PR-Agent r2 (run #170): append EACH successful upload to the form state
    // immediately — a mid-loop failure (e.g. the 10/min throttle) must not
    // discard files that already landed server-side (the next Save would
    // silently PATCH them out of venues.images — data loss).
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        if (values.images.length + uploaded >= MAX_IMAGES) {
          setUploadError(t('imagesTooMany'));
          break;
        }
        const form = new FormData();
        form.append('file', file);
        const res = await api.upload<{ path: string }>(
          `/media/venues?venueId=${encodeURIComponent(venue.id)}`,
          form,
        );
        if (res?.path) {
          uploaded += 1;
          setValues((v) =>
            v.images.includes(res.path) ? v : { ...v, images: [...v.images, res.path] },
          );
        }
      }
    } catch (e) {
      // Error standard: what happened + why + what to do next (localized).
      // Partial-success is preserved: uploads that landed stay in the grid.
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 429) setUploadError(t('imagesTooFast'));
      else if (status === 413 || status === 400) setUploadError(t('imagesBadType'));
      else if (status === 403) setUploadError(t('imagesForbidden'));
      else setUploadError(t('imagesUploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  /** P1-38: remove one photo from the form grid (persisted on Save). */
  function removeImage(path: string) {
    setValues((v) => ({ ...v, images: v.images.filter((p) => p !== path) }));
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

            {/* P1-38 (run #170): venue photos — upload, grid, remove-on-Save.
                PR-Agent r6 MINOR: upload is EDIT-MODE ONLY (the API requires a
                venue id); in create mode show the hint instead of a dead button. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="block text-xs font-medium text-gray-700">
                  {t('images')}{' '}
                  <span className="text-gray-400">
                    ({values.images.length}/{MAX_IMAGES})
                  </span>
                </span>
                {venue && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || values.images.length >= MAX_IMAGES}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t('imagesAdd')}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => void handleFilesSelected(e.target.files)}
              />
              {uploadError && (
                <p role="alert" className="mb-1.5 text-[11px] text-brand-red">
                  {uploadError}
                </p>
              )}
              <p className="mb-2 text-[11px] text-gray-400">
                {venue ? t('imagesHint') : t('imagesCreateHint')}
              </p>
              {values.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {values.images.map((path) => (
                    <div key={path} className="group relative overflow-hidden rounded-lg border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element -- API-served dynamic path, plain img keeps CSP simple */}
                      <img
                        src={`${API_ORIGIN}${path}`}
                        alt=""
                        className="h-20 w-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(path)}
                        aria-label={t('imagesRemove')}
                        className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      >
                        <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 2l10 10M12 2L2 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
      </div>
    </Drawer>
  );
}
