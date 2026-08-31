'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { PartnerSlot } from '@/lib/types';

const fmtTime = (t: string) => t.slice(0, 5);

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SlotManagerProps {
  pitchId: string;
  pitchName: string;
  slots: PartnerSlot[];
  loading: boolean;
  onChanged: () => void;
  /** Which console surface owns the calls: partner (default) or admin. */
  endpointBase?: '/partner' | '/admin';
}

/**
 * Weekly slot schedule for one pitch: 7-day grid of slots with booking state,
 * a recurring-pattern generator, single-slot add, and unbooked-slot delete.
 * Localized (en/ar); times/dates keep dir=ltr for readability in RTL.
 */
export default function SlotManager({ pitchId, pitchName, slots, loading, onChanged, endpointBase = '/partner' }: SlotManagerProps) {
  const t = useTranslations('slotManager');
  const tc = useTranslations('common');
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString().slice(0, 10);
  });
  const [showGenerator, setShowGenerator] = useState(false);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [pattern, setPattern] = useState({
    days_of_week: [0, 1, 2, 3, 4, 5, 6] as number[],
    start_time: '16:00',
    end_time: '23:00',
    slot_duration_mins: 60,
    weeks_ahead: 4,
  });
  const [oneSlot, setOneSlot] = useState({ slot_date: new Date().toISOString().slice(0, 10), start_time: '18:00', end_time: '19:00' });

  const dayLabels = useMemo(
    () => [t('day0'), t('day1'), t('day2'), t('day3'), t('day4'), t('day5'), t('day6')],
    [t],
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, PartnerSlot[]>();
    for (const s of slots) {
      const list = map.get(s.slot_date) ?? [];
      list.push(s);
      map.set(s.slot_date, list);
    }
    return map;
  }, [slots]);

  const weekStats = useMemo(() => {
    const inWeek = slots.filter((s) => s.slot_date >= days[0] && s.slot_date <= days[6]);
    return {
      total: inWeek.length,
      booked: inWeek.filter((s) => s.is_booked).length,
      utilization: inWeek.length ? Math.round((inWeek.filter((s) => s.is_booked).length / inWeek.length) * 100) : 0,
    };
  }, [slots, days]);

  async function generate() {
    setBusyAction(true);
    setMessage(null);
    try {
      const res = await api.post<{ created: number; skipped: number }>(
        `${endpointBase}/pitches/${pitchId}/slots/generate`,
        pattern,
      );
      setMessage(t('created', { created: res.created, skipped: res.skipped }));
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('generationFailed'));
    } finally {
      setBusyAction(false);
    }
  }

  async function addOne() {
    setBusyAction(true);
    setMessage(null);
    try {
      await api.post(`${endpointBase}/pitches/${pitchId}/slots`, oneSlot);
      setShowAddSlot(false);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('couldNotAdd'));
    } finally {
      setBusyAction(false);
    }
  }

  async function remove(slotId: string) {
    setBusyId(slotId);
    setMessage(null);
    try {
      await api.delete(`${endpointBase}/slots/${slotId}`);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('scheduleTitle', { name: pitchName })}</h2>
          <p className="text-xs text-gray-500">
            {t('weekStats', {
              total: weekStats.total,
              booked: weekStats.booked,
              utilization: weekStats.utilization,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('prevWeek')}
          </button>
          <span className="text-xs font-medium text-gray-500" dir="ltr">
            {days[0]} → {days[6]}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('nextWeek')}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setShowGenerator((v) => !v); setShowAddSlot(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
        >
          <Sparkles className="h-3.5 w-3.5" /> {t('generatePattern')}
        </button>
        <button
          onClick={() => { setShowAddSlot((v) => !v); setShowGenerator(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
        >
          <Plus className="h-3.5 w-3.5" /> {t('addSingleSlot')}
        </button>
      </div>

      {message && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{message}</p>}

      {/* Generator form */}
      {showGenerator && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('recurringPattern')}</h3>
            <button onClick={() => setShowGenerator(false)} className="text-gray-400 hover:text-gray-600" aria-label={tc('close')}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dayLabels.map((label, i) => {
              const on = pattern.days_of_week.includes(i);
              return (
                <button
                  key={label}
                  onClick={() =>
                    setPattern((p) => ({
                      ...p,
                      days_of_week: on ? p.days_of_week.filter((x) => x !== i) : [...p.days_of_week, i],
                    }))
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    on ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <label className="text-xs text-gray-500">
              {t('from')}
              <input type="time" value={pattern.start_time} onChange={(e) => setPattern((p) => ({ ...p, start_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              {t('to')}
              <input type="time" value={pattern.end_time} onChange={(e) => setPattern((p) => ({ ...p, end_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              {t('slotLength')}
              <select value={pattern.slot_duration_mins} onChange={(e) => setPattern((p) => ({ ...p, slot_duration_mins: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {[30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              {t('weeksAhead')}
              <select value={pattern.weeks_ahead} onChange={(e) => setPattern((p) => ({ ...p, weeks_ahead: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {[1, 2, 4, 8, 12].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <button
            onClick={generate}
            disabled={busyAction || pattern.days_of_week.length === 0}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t('generate')}
          </button>
        </div>
      )}

      {/* Single slot form */}
      {showAddSlot && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('addSingleTitle')}</h3>
            <button onClick={() => setShowAddSlot(false)} className="text-gray-400 hover:text-gray-600" aria-label={tc('close')}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">
              {t('date')}
              <input type="date" value={oneSlot.slot_date} onChange={(e) => setOneSlot((s) => ({ ...s, slot_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              {t('start')}
              <input type="time" value={oneSlot.start_time} onChange={(e) => setOneSlot((s) => ({ ...s, start_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              {t('end')}
              <input type="time" value={oneSlot.end_time} onChange={(e) => setOneSlot((s) => ({ ...s, end_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <button
            onClick={addOne}
            disabled={busyAction}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t('addSlot')}
          </button>
        </div>
      )}

      {/* Week grid */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">{t('loadingSchedule')}</div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {days.map((date) => {
            const daySlots = byDay.get(date) ?? [];
            return (
              <div key={date} className="rounded-xl border border-gray-100 bg-gray-50/40 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {dayLabels[new Date(`${date}T00:00:00`).getDay()]}
                  </span>
                  <span className="text-[10px] text-gray-400" dir="ltr">{date.slice(5)}</span>
                </div>
                <div className="space-y-1">
                  {daySlots.length === 0 && <p className="px-1 text-[10px] text-gray-300">{t('noSlots')}</p>}
                  {daySlots.map((s) => (
                    <div
                      key={s.id}
                      className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] ${
                        s.is_booked ? 'bg-brand-green/10 text-brand-green' : 'bg-white text-gray-700 border border-gray-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-semibold" dir="ltr">{fmtTime(s.start_time)}</span>
                        {s.is_booked && s.match_title ? (
                          <p className="truncate text-[10px] opacity-80">{s.match_title}</p>
                        ) : null}
                      </div>
                      {!s.is_booked && (
                        <button
                          onClick={() => remove(s.id)}
                          disabled={busyId === s.id}
                          className="opacity-0 transition-opacity group-hover:opacity-100 text-gray-400 hover:text-red-500"
                          aria-label={t('deleteSlotAria')}
                        >
                          {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-gray-400">
        <CalendarDays className="h-3.5 w-3.5" /> {t('footer')}
      </p>
    </div>
  );
}
