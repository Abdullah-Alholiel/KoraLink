'use client';

import { useState } from 'react';
import { Loader2, MapPin, Plus, X } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import PageHeader from '@/components/PageHeader';

interface PartnerVenue {
  id: string;
  name: string;
  city: string;
}

/** Partner "My Venues" — list own venues and create new ones (admin approves). */
export default function PartnerVenuesPage() {
  const { data, loading, error, reload } = useLiveAdminData<PartnerVenue[]>('/partner/venues', ['venues']);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', address: '' });

  async function create() {
    setSaving(true);
    try {
      await api.post('/partner/venues', form);
      setShowForm(false);
      setForm({ name: '', city: '', address: '' });
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My Venues"
        subtitle="Your venues on KoraLink — new venues are reviewed by an admin before going live"
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Venue'}
          </button>
        }
      />

      <div className="p-8">
        {showForm && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Add New Venue</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Venue name (e.g. Olaya Sports Park)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="City (e.g. Riyadh)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Address"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={create}
              disabled={saving || !form.name || !form.city || !form.address}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit for review
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
              <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                    <MapPin className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{v.name}</div>
                    <div className="text-xs text-gray-500">{v.city}</div>
                  </div>
                </div>
              </div>
            ))}
            {!data?.length && (
              <div className="text-sm text-gray-400">No venues yet — add one above.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
