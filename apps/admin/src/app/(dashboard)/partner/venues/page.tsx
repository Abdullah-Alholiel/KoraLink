'use client';

import { useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, X } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api, getRole } from '@/lib/api';
import type { PartnerVenueRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

/** Admins inspecting the partner portal see every venue + its owner. */
const isAdmin = getRole() === 'Admin';

export default function PartnerVenuesPage() {
  const { data, loading, error, reload } = useLiveAdminData<PartnerVenueRow[]>('/partner/venues', ['venues']);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PartnerVenueRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', city: '', address: '' });
  const [editValues, setEditValues] = useState({ name: '', city: '', address: '', amenities: '' });

  async function create() {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/partner/venues', form);
      setShowForm(false);
      setForm({ name: '', city: '', address: '' });
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create venue');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(v: PartnerVenueRow) {
    const amenities = Array.isArray(v.amenities) ? (v.amenities as string[]).join(', ') : '';
    setEditValues({ name: v.name, city: v.city, address: v.address, amenities });
    setEditing(v);
  }

  async function saveEdit() {
    if (!editing) return;
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
      });
      setEditing(null);
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to update venue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'All Partner Venues' : 'My Venues'}
        subtitle={
          isAdmin
            ? 'Every venue on the platform — edit any profile field in support of a venue owner'
            : 'Your venues on KoraLink — new venues are reviewed by an admin before going live'
        }
        actions={
          !isAdmin && (
            <button
              onClick={() => { setShowForm((v) => !v); setFormError(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'Cancel' : 'Add Venue'}
            </button>
          )
        }
      />

      <div className="space-y-6 p-8">
        {showForm && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Add New Venue</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Venue name (e.g. Olaya Sports Park)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City (e.g. Riyadh)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Address" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <button onClick={create} disabled={saving || !form.name || !form.city || !form.address} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit for review
            </button>
          </div>
        )}

        {/* Edit panel */}
        {editing && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Edit “{editing.name}”</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <input value={editValues.name} onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.city} onChange={(e) => setEditValues((v) => ({ ...v, city: e.target.value }))} placeholder="City" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.address} onChange={(e) => setEditValues((v) => ({ ...v, address: e.target.value }))} placeholder="Address" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={editValues.amenities} onChange={(e) => setEditValues((v) => ({ ...v, amenities: e.target.value }))} placeholder="Amenities (comma-separated)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            {formError && <p className="mt-3 text-xs text-red-600">{formError}</p>}
            <button onClick={saveEdit} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading venues…</div>
        ) : error ? (
          <div className="py-10 text-sm text-red-600">Failed to load: {error}</div>
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
                        <div className="mt-0.5 text-[11px] text-gray-400">Owner: {v.owner_name}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.is_approved ? 'approved' : 'pending'} />
                    {v.is_koralink_partner && (
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">PARTNER</span>
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
                  <span className="text-xs text-gray-500">{v.pitch_count ?? 0} pitch(es)</span>
                  <button onClick={() => startEdit(v)} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </div>
            ))}
            {!data?.length && <div className="text-sm text-gray-400">No venues yet — add one above.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
