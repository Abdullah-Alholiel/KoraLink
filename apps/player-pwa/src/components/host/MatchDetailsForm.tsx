'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Clock, Shield, MapPin } from 'lucide-react';
import { todayInRiyadh } from '@/lib/api-adapter';
import DateTimeOverlayInput from '@/components/host/DateTimeOverlayInput';

/* ── Format options ─────────────────────────────── */
export const FORMAT_OPTIONS = ['5v5', '7v7', '8v8', '11v11'] as const;
export type Format = (typeof FORMAT_OPTIONS)[number];

/* ── Gender & Match Type option maps ──────────────── */
export const GENDER_OPTIONS = ['Men Only', 'Women Only', 'Mixed'] as const;
export type GenderRule = (typeof GENDER_OPTIONS)[number];

export const MATCH_TYPES = ['Casual', 'Competitive'] as const;
export type MatchTypeValue = (typeof MATCH_TYPES)[number];

/** Snap an "HH:MM" time to the nearest 10-minute mark (00/10/20/30/40/50).
 *  Avoids awkward kick-off times like 18:37. Rounds to nearest (18:37→18:40,
 *  18:32→18:30), wraps the hour (18:58→19:00), and caps at 23:50 so the snap
 *  never silently moves the match to the next day. Empty input passes through. */
export function snapTimeTo10(value: string): string {
    if (!value) return value;
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return value;
    const total = h * 60 + m;
    const snapped = Math.round(total / 10) * 10;
    const capped = Math.min(snapped, 23 * 60 + 50); // never roll past 23:50
    const hh = String(Math.floor(capped / 60)).padStart(2, '0');
    const mm = String(capped % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

export const GENDER_I18N_MAP: Record<GenderRule, string> = {
    'Men Only': 'host.genderMen',
    'Women Only': 'host.genderWomen',
    Mixed: 'host.genderMixed',
};

export const MATCH_TYPE_I18N_MAP: Record<MatchTypeValue, string> = {
    Casual: 'host.matchTypeCasual',
    Competitive: 'host.matchTypeCompetitive',
};

export interface MatchDetailsFormProps {
    title: string;
    setTitle: (v: string) => void;
    matchType: MatchTypeValue;
    setMatchType: (v: MatchTypeValue) => void;
    genderRule: GenderRule;
    setGenderRule: (v: GenderRule) => void;
    date: string;
    setDate: (v: string) => void;
    time: string;
    setTime: (v: string) => void;
    duration: number;
    setDuration: (v: number) => void;
    /** When true, date & time come from a slot — section is locked */
    readOnlyDateTime?: boolean;
    /** When true, duration is computed from the slot — section is locked */
    readOnlyDuration?: boolean;
    /** When set, format is locked to the selected pitch's size (US4) */
    lockedFormat?: Format;
}

export default function MatchDetailsForm({
    title, setTitle,
    matchType, setMatchType,
    genderRule, setGenderRule,
    date, setDate,
    time, setTime,
    duration, setDuration,
    readOnlyDateTime = false,
    readOnlyDuration = false,
    lockedFormat,
}: MatchDetailsFormProps) {
    const locale = useLocale();
    const t = useTranslations();

    return (
        <>
            {/* ── MATCH TITLE ─────────────────── */}
            <div className="px-5 pt-4">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.matchTitle')}
                </p>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('host.matchTitlePlaceholder')}
                    maxLength={255}
                    className="w-full bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 text-sm
                        text-brand-black placeholder:text-gray-400 outline-none focus:border-brand-green transition-colors"
                />
                {title.length > 0 && title.length < 3 && (
                    <p className="text-xs text-brand-red mt-1">{t('host.matchTitleValidation')}</p>
                )}
            </div>

            {/* ── FORMAT ───────────────────────────── */}
            <div className="px-5 pt-6">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.format')}
                </p>
                {lockedFormat ? (
                    /* Format locked to the selected pitch's size (US4) */
                    <div className="bg-brand-green/5 rounded-xl border border-brand-green/20 p-3.5 flex items-center gap-3">
                        <Shield className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <div>
                            <p className="text-sm font-bold text-brand-black">{lockedFormat}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t('host.lockedByPitch')}
                            </p>
                        </div>
                    </div>
                ) : (
                    /* No pitch yet — format derives from the pitch, so prompt
                     * for pitch selection instead of offering a free picker
                     * that the pitch would silently override (US4). */
                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <p className="text-xs text-gray-500">
                            {t('host.formatFromPitchHint')}
                        </p>
                    </div>
                )}
            </div>

            {/* ── MATCH TYPE ──────────────────── */}
            <div className="px-5 pt-6">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.matchType')}
                </p>
                <div className="flex gap-2">
                    {MATCH_TYPES.map((type) => (
                        <button
                            key={type}
                            onClick={() => setMatchType(type)}
                            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                matchType === type
                                    ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            {t(MATCH_TYPE_I18N_MAP[type])}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── GENDER ────────────────────────── */}
            <div className="px-5 pt-6">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.gender')}
                </p>
                <div className="flex gap-2">
                    {GENDER_OPTIONS.map((g) => (
                        <button
                            key={g}
                            onClick={() => setGenderRule(g)}
                            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                genderRule === g
                                    ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            {t(GENDER_I18N_MAP[g])}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── DATE & TIME ───────────────────── */}
            <div className="px-5 pt-6">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.dateTime')}
                </p>
                {readOnlyDateTime ? (
                    /* In koralink mode: date/time are locked from the selected slot */
                    <div className="bg-brand-green/5 rounded-xl border border-brand-green/20 p-3.5 flex items-center gap-3">
                        <Shield className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <div>
                            <p className="text-sm font-bold text-brand-black">
                                {new Date(date + 'T00:00:00').toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
                                    month: 'short', day: 'numeric',
                                })}
                                {' · '}
                                {new Date(`2025-01-01T${time}`).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', {
                                    hour: 'numeric', minute: '2-digit', hour12: true,
                                })}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t('host.slotLocked')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-3">
                        <DateTimeOverlayInput
                            type="date"
                            value={date}
                            onChange={setDate}
                            label={t('host.date')}
                            min={todayInRiyadh()}
                            className="flex-1"
                            display={
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                    <span className="text-sm font-bold text-brand-black">
                                        {date
                                            ? new Date(date + 'T00:00:00').toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
                                                month: 'short', day: 'numeric',
                                            })
                                            : t('host.selectDate')}
                                    </span>
                                </div>
                            }
                        />
                        <DateTimeOverlayInput
                            type="time"
                            value={time}
                            onChange={(v) => setTime(snapTimeTo10(v))}
                            label={t('host.time')}
                            step={600}
                            className="flex-1"
                            display={
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                    <span className="text-sm font-bold text-brand-black">
                                        {time
                                            ? new Date(`2025-01-01T${time}`).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', {
                                                hour: 'numeric', minute: '2-digit', hour12: true,
                                            })
                                            : t('host.selectTime')}
                                    </span>
                                </div>
                            }
                        />
                        <p className="text-[10px] text-gray-400 mt-1.5">{t('host.timeStepHint')}</p>
                    </div>
                )}
            </div>

            {/* ── DURATION ─────────────────────── */}
            <div className="px-5 pt-6">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                    {t('host.duration')}
                </p>
                {readOnlyDuration ? (
                    /* In koralink mode: duration is locked from the selected slot */
                    <div className="bg-brand-green/5 rounded-xl border border-brand-green/20 p-3.5 flex items-center gap-3">
                        <Shield className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <div>
                            <p className="text-sm font-bold text-brand-black">
                                {duration} {t('host.minutes')}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t('host.durationLocked')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        {[30, 45, 60, 90, 120].map((m) => (
                            <button
                                key={m}
                                onClick={() => setDuration(m)}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                    duration === m
                                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {m}m
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
