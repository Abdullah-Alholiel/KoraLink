'use client';

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { PartnerPitch } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import EditPitchSheet from '@/components/EditPitchSheet';

interface OwnedVenue {
  id: string;
  name: string;
  city: string;
}

export default function MyPitchesPage() {
  const { data, loading, error, reload } = useLiveAdminData<PartnerPitch[]>('/partner/pitches', ['venues']);
  const venues = useLiveAdminData<OwnedVenue[]>('/partner/venues', ['venues']);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PartnerPitch | null>(null);
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
    try {
      await api.post('/partner/pitches', form);
      setShowForm(false);
      setForm((f) => ({ ...f, name: '' }));
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function savePitch(pitchId: string, values: { name: string; size: string; surface_type: string; environment: string; hourly_rate: number }) {
    await api.patch(`/partner/pitches/${pitchId}`, values);
    reload();
  }

  return (
    <div>
      <PageHeader
        title="My Pitches"
        subtitle="Configure details, pricing, and availability for your venue"
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add New Pitch'}
          </button>
        }
      />

      <div className="p-8">
        <EditPitchSheet pitch={editing} onClose={() => setEditing(null)} onSave={savePitch} />

        {showForm && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Add New Pitch</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <select
                value={form.venue_id}
                onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select venue…</option>
                {(venues.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pitch name (e.g. North Wing)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="5v5">5v5</option>
                <option value="7v7">7v7</option>
                <option value="8v8">8v8</option>
                <option value="11v11">11v11</option>
              </select>
              <select
                value={form.surface_type}
                onChange={(e) => setForm((f) => ({ ...f, surface_type: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="Artificial">Artificial turf</option>
                <option value="Grass">Grass</option>
              </select>
              <select
                value={form.environment}
                onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="Outdoor">Outdoor</option>
                <option value="Indoor">Indoor</option>
              </select>
              <input
                type="number"
                value={form.hourly_rate}
                onChange={(e) => setForm((f) => ({ ...f, hourly_rate: Number(e.target.value) }))}
                placeholder="Hourly rate (SAR)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={addPitch}
              disabled={saving || !form.venue_id || !form.name}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create pitch
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading pitches…</div>
        ) : error ? (
          <div className="py-10 text-sm text-red-600">Failed to load: {error}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.venue_name ?? '—'}</div>
                  </div>
                  <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">Size</dt>
                    <dd className="text-gray-900">{p.size}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Surface</dt>
                    <dd className="text-gray-900">{p.surface_type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Environment</dt>
                    <dd className="text-gray-900">{p.environment}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Hourly rate</dt>
                    <dd className="text-gray-900">{formatMoney(p.hourly_rate)}</dd>
                  </div>
                </dl>
                <button
                  onClick={() => toggleActive(p)}
                  disabled={busyId === p.id}
                  className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busyId === p.id ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : p.is_active ? (
                    'Set unavailable'
                  ) : (
                    'Set available'
                  )}
                </button>
                <button
                  onClick={() => setEditing(editing?.id === p.id ? null : p)}
                  className="mt-2 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
                >
                  {editing?.id === p.id ? 'Close editor' : 'Edit details'}
                </button>
              </div>
            ))}
            {!data?.length && <div className="text-sm text-gray-400">No pitches yet — add one above.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
