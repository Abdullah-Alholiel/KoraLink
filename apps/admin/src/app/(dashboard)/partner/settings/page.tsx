'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { PartnerVerificationRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerSettingsPage() {
  const { data, loading, error, reload } = useLiveAdminData<PartnerVerificationRow[]>('/partner/verification', ['venues']);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    legal_entity_name: '',
    commercial_reg: '',
    tax_id: '',
    iban: '',
    manager_name: '',
    manager_phone: '',
  });

  const selectedRow = (data ?? []).find((r) => r.venue_id === selected) ?? (data ?? [])[0];
  const existing = selectedRow?.verification ?? null;

  function fillFromExisting(row: PartnerVerificationRow | undefined) {
    const v = row?.verification;
    if (v) {
      setForm({
        legal_entity_name: v.legal_entity_name,
        commercial_reg: v.commercial_reg ?? '',
        tax_id: v.tax_id ?? '',
        iban: v.iban ?? '',
        manager_name: v.manager_name ?? '',
        manager_phone: v.manager_phone ?? '',
      });
    } else {
      setForm({ legal_entity_name: '', commercial_reg: '', tax_id: '', iban: '', manager_name: '', manager_phone: '' });
    }
  }

  async function submit() {
    if (!selectedRow) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/partner/verification', { venue_id: selectedRow.venue_id, ...form });
      setSaved(true);
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business profile and verification" />

      <div className="max-w-2xl p-8">
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600">Failed to load: {error}</div>
        ) : !data?.length ? (
          <div className="text-sm text-gray-400">No venues associated with your account.</div>
        ) : (
          <div className="space-y-5">
            {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Verification submitted.</p>}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Venue</label>
              <select
                value={selectedRow?.venue_id ?? ''}
                onChange={(e) => {
                  setSelected(e.target.value);
                  fillFromExisting(data.find((r) => r.venue_id === e.target.value));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {data.map((r) => (
                  <option key={r.venue_id} value={r.venue_id}>
                    {r.venue_name ?? r.venue_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Verification status:</span>
              <StatusBadge status={existing?.status ?? 'pending'} />
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Legal entity name</label>
                <input
                  value={form.legal_entity_name}
                  onChange={(e) => setForm((f) => ({ ...f, legal_entity_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Al-Nassr Sports Club Co."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Commercial registration</label>
                  <input
                    value={form.commercial_reg}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_reg: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tax ID</label>
                  <input
                    value={form.tax_id}
                    onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">IBAN</label>
                  <input
                    value={form.iban}
                    onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Manager name</label>
                  <input
                    value={form.manager_name}
                    onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Manager phone</label>
                  <input
                    value={form.manager_phone}
                    onChange={(e) => setForm((f) => ({ ...f, manager_phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="+9665xxxxxxxx"
                  />
                </div>
              </div>
              <button
                onClick={submit}
                disabled={saving || !form.legal_entity_name}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Submit verification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
