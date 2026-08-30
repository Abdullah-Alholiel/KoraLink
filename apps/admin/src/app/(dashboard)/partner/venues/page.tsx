'use client';

import { useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api, getRole } from '@/lib/api';
import type { PartnerVenueRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

/** Admins inspecting the partner portal see every venue + its owner. */
const isAdmin = getRole() === 'Admin';

export default function PartnerVenuesPage() {
  const t = useTranslations('partner.venues');
  const tc = useTranslations('common');
  const { data, loading, error, reload } = useLiveAdminData<PartnerVenueRow[]>('/partner/venues', ['venues']);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PartnerVenueRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', city: '', address: '' });
  const [editValues, setEditValues] = useState({
    name: '',
    city: '',
    address: '',
    amenities: '',
    open: '8',
    close: '23',
    closedDays: [false, false, false, false, false, false, false],
  });

  async function create() {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/partner/venues', form);
      setShowForm(false);
      setForm({ name: '', city: '', address: '' });
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(v: PartnerVenueRow) {
    const amenities = Array.isArray(v.amenities) ? (v.amenities as string[]).join(', ') : '';
    setEditValues({
      name: v.name,
      city: v.city,
      address: v.address,
      amenities,
      open: String(v.open_hour ?? 8),
      close: String(v.close_hour ?? 23),
      closedDays: [
        Boolean(v.closed_day_0),
        Boolean(v.closed_day_1),
        Boolean(v.closed_day_2),
        Boolean(v.closed_day_3),
        Boolean(v.closed_day_4),
        Boolean(v.closed_day_5),
        Boolean(v.closed_day_6),
      ],
    });
    setEditing(v);
  }

  async function saveEdit() {
    if (!editing) return;
    const openHour = Number(editValues.open);
    const closeHour = Number(editValues.close);
    // P2-31(1): validate BEFORE the request — empty/NaN no longer serialize
    // as JSON null, and the partner sees a localized message instead of the
    // API's raw close>open error.
    if (
      Number.isNaN(openHour) ||
      Number.isNaN(closeHour) ||
      openHour < 0 || openHour > 23 ||
      closeHour < 1 || closeHour > 24 ||
      closeHour <= openHour
    ) {
      setFormError(t('hoursInvalid'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/partner/venues/${editing.id}`, {
        name: editValues.name,
        city: editValues.city,
        address: editValues.address,
        amenities: editValues.amenities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        // P1-25 operating hours (API validates the cross-field close > open rule)
        open_hour: openHour,
        close_hour: closeHour,
        ...Object.fromEntries(
          editValues.closedDays.map((closed, day) => [`closed_day_${day}`, closed]),
        ),
      });
      setEditing(null);
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('updateFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isAdmin ? t('titleAll') : t('titleMine')}
        subtitle={isAdmin ? t('subtitleAll') : t('subtitleMine')}
        actions={
          !isAdmin && (
            <button
              onClick={() => { setShowForm((v) => !v); setFormError(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? tc('cancel') : t('addVenue')}
            </button>
          )
        }
      />

      <div className="space-y-6 p-8">
        {showForm && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('addNewTitle')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('phVenueName')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder={t('phCity')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder={t('phAddress')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <button onClick={create} disabled={saving || !form.name || !form.city || !form.address} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('submitForReview')}
            </button>
          </div>
        )}

        {/* Edit panel */}
        {editing && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('editTitle', { name: editing.name })}</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 hover:bg-gray-100" aria-label={tc('close')}><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <input value={editValues.name} onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} placeholder={t('phName')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.city} onChange={(e) => setEditValues((v) => ({ ...v, city: e.target.value }))} placeholder={t('phCityShort')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.address} onChange={(e) => setEditValues((v) => ({ ...v, address: e.target.value }))} placeholder={t('phAddressShort')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.amenities} onChange={(e) => setEditValues((v) => ({ ...v, amenities: e.target.value }))} placeholder={t('phAmenities')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>

            {/* P1-25 operating hours */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  {t('openHour')}
                  <select
                    value={editValues.open}
                    onChange={(e) => setEditValues((v) => ({ ...v, open: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  {t('closeHour')}
                  <select
                    value={editValues.close}
                    onChange={(e) => setEditValues((v) => ({ ...v, close: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = i + 1; // 1..24 (24 = midnight)
                      return <option key={h} value={String(h)}>{h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}</option>;
                    })}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-xs font-medium text-gray-600">{t('closedDays')}</span>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <label key={day} className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={editValues.closedDays[day]}
                      onChange={(e) =>
                        setEditValues((v) => ({
                          ...v,
                          closedDays: v.closedDays.map((c, i) => (i === day ? e.target.checked : c)),
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    {t(`closedDay${day}`)}
                  </label>
                ))}
              </div>
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <button onClick={saveEdit} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              {tc('saveChanges')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="py-10 text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((v) => (
              <div key={v.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <MapPin className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{v.name}</div>
                      <div className="text-xs text-gray-500">{v.city} · {v.address}</div>
                      {isAdmin && v.owner_name && (
                        <div className="mt-0.5 text-[11px] text-gray-400">{t('owner', { name: v.owner_name })}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.is_approved ? 'approved' : 'pending'} />
                    {v.is_koralink_partner && (
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{t('partnerBadge')}</span>
                    )}
                  </div>
                </div>

                {Array.isArray(v.amenities) && (v.amenities as string[]).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(v.amenities as string[]).map((a) => (
                      <span key={a} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{a}</span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="text-xs text-gray-500">
                    {t('pitchCount', { count: v.pitch_count ?? 0 })}
                    {v.open_hour !== undefined && v.close_hour !== undefined && (
                      <> · {t('hoursSummary', { open: v.open_hour, close: v.close_hour })}</>
                    )}
                  </span>
                  <button onClick={() => startEdit(v)} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">
                    <Pencil className="h-3.5 w-3.5" /> {tc('edit')}
                  </button>
                </div>
              </div>
            ))}
            {!data?.length && <div className="text-sm text-gray-400">{t('empty')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
