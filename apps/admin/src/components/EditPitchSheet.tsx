'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { PartnerPitch } from '@/lib/types';

interface EditPitchSheetProps {
  pitch: PartnerPitch | null;
  onClose: () => void;
  onSave: (pitchId: string, values: EditPitchValues) => Promise<void>;
}

export interface EditPitchValues {
  name: string;
  size: string;
  surface_type: string;
  environment: string;
  hourly_rate: number;
}

/** Inline edit panel for a pitch (PATCH /partner/pitches/:id). */
export default function EditPitchSheet({ pitch, onClose, onSave }: EditPitchSheetProps) {
  const [values, setValues] = useState<EditPitchValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pitch) {
      setValues({
        name: pitch.name,
        size: pitch.size,
        surface_type: pitch.surface_type,
        environment: pitch.environment,
        hourly_rate: Number(pitch.hourly_rate),
      });
    } else {
      setValues(null);
    }
  }, [pitch]);

  if (!pitch || !values) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Edit “{pitch.name}”</h2>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100" aria-label="Close">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <input
          value={values.name}
          onChange={(e) => setValues((v) => (v ? { ...v, name: e.target.value } : v))}
          placeholder="Pitch name"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={values.size}
          onChange={(e) => setValues((v) => (v ? { ...v, size: e.target.value } : v))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="5v5">5v5</option>
          <option value="7v7">7v7</option>
          <option value="8v8">8v8</option>
          <option value="11v11">11v11</option>
        </select>
        <select
          value={values.surface_type}
          onChange={(e) => setValues((v) => (v ? { ...v, surface_type: e.target.value } : v))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="Artificial">Artificial turf</option>
          <option value="Grass">Grass</option>
        </select>
        <select
          value={values.environment}
          onChange={(e) => setValues((v) => (v ? { ...v, environment: e.target.value } : v))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="Outdoor">Outdoor</option>
          <option value="Indoor">Indoor</option>
        </select>
        <input
          type="number"
          value={values.hourly_rate}
          onChange={(e) => setValues((v) => (v ? { ...v, hourly_rate: Number(e.target.value) } : v))}
          placeholder="Hourly rate (SAR)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(pitch.id, values);
            onClose();
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving || !values.name}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save changes
      </button>
    </div>
  );
}
