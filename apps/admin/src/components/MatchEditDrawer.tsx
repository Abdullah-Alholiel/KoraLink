'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Drawer from '@/components/Drawer';
import FormField from '@/components/FormField';
import { api } from '@/lib/api';
import type { AdminMatch } from '@/lib/types';

interface MatchEditDrawerProps {
  match: AdminMatch | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Admin match correction drawer (admin-ux-overhaul slice 3).
 * Metadata is always editable; schedule fields appear only for SELF-booked
 * matches (koralink-booked matches keep their slot as the schedule source
 * of truth — rescheduling goes through the host flow).
 */
export default function MatchEditDrawer({ match, onClose, onSaved }: MatchEditDrawerProps) {
  const t = useTranslations('matchEdit');
  const tc = useTranslations('common');
  // Local const so closures narrow properly (the early render-return is below).
  const m = match;

  const [title, setTitle] = useState('');
  const [matchType, setMatchType] = useState('Casual');
  const [genderRule, setGenderRule] = useState('Mixed');
  const [dateTime, setDateTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!m) return;
    setTitle(m.title);
    setMatchType(m.match_type);
    setGenderRule(m.gender_rule);
    setDateTime(m.scheduled_at ? m.scheduled_at.slice(0, 16) : '');
    setDuration(m.duration_mins ?? 60);
    setError(null);
  }, [m]);

  if (!m) return null;

  // Narrowed alias: closures (submit) capture the non-null type.
  const mm = m;

  const isSelf = mm.booking_mode === 'self';

  async function submit() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    if (title.trim() !== mm.title) payload.title = title.trim();
    if (matchType !== mm.match_type) payload.match_type = matchType;
    if (genderRule !== mm.gender_rule) payload.gender_rule = genderRule;
    if (isSelf) {
      if (dateTime) {
        const d = new Date(dateTime);
        if (!Number.isNaN(d.getTime()) && d.toISOString() !== new Date(mm.scheduled_at).toISOString()) {
          payload.scheduled_at = d.toISOString();
        }
      }
      if (duration !== (mm.duration_mins ?? 60)) payload.duration_mins = duration;
    }
    try {
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      await api.patch(`/admin/matches/${mm.id}`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!match}
      onClose={onClose}
      title={t('editTitle', { name: mm.title })}
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
            {tc('saveChanges')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label={t('fldTitle')} required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('fldType')}>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="Casual">Casual</option>
              <option value="Competitive">Competitive</option>
            </select>
          </FormField>

          <FormField label={t('fldGender')}>
            <select
              value={genderRule}
              onChange={(e) => setGenderRule(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="Mixed">Mixed</option>
              <option value="Men Only">Men Only</option>
              <option value="Women Only">Women Only</option>
            </select>
          </FormField>
        </div>

        {isSelf ? (
          <>
            <FormField label={t('fldDate')}>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                dir="ltr"
              />
            </FormField>
            <FormField label={t('fldDuration')}>
              <input
                type="number"
                min={30}
                max={480}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                dir="ltr"
              />
            </FormField>
          </>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            {t('slotBookedHint')}
          </p>
        )}

        {error && <p className="text-sm text-brand-red">{error}</p>}
      </div>
    </Drawer>
  );
}
