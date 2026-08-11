'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, MapPin, ChevronRight, AlertTriangle, Shield } from 'lucide-react';
import { useCreateMatch } from '@/hooks/useMatches';
import { useVenue, type VenueApi, type PitchApi } from '@/hooks/useVenues';

import ModeToggle from './ModeToggle';
import MatchDetailsForm, { type Format, type GenderRule, type MatchTypeValue } from './MatchDetailsForm';
import VenuePickerSheet from './VenuePickerSheet';
import PitchSelector from './PitchSelector';
import SlotPicker from './SlotPicker';
import CostFooter from './CostFooter';
import PublishWarningSheet from './PublishWarningSheet';
import type { PitchSlotApi } from '@/hooks/usePitchSlots';

export default function HostMatchForm() {
    const router = useRouter();
    const locale = useLocale();
    const t = useTranslations();
    const createMatch = useCreateMatch();

    /* ── Mode State ──────────────────────────────── */
    const [mode, setMode] = useState<'koralink' | 'self'>('self');
    const [showWarning, setShowWarning] = useState(false);

    /* ── Form State ─────────────────────────────── */
    const [showVenuePicker, setShowVenuePicker] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState<VenueApi | null>(null);
    const [selectedPitch, setSelectedPitch] = useState<PitchApi | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<PitchSlotApi | null>(null);

    const { data: venueDetail } = useVenue(selectedVenue?.id ?? null);

    const [title, setTitle] = useState('');
    const [format, setFormat] = useState<Format>('7v7');
    const [matchType, setMatchType] = useState<MatchTypeValue>('Casual');
    const [genderRule, setGenderRule] = useState<GenderRule>('Men Only');
    const [duration, setDuration] = useState(60);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    // Derive cost from selected pitch's hourly rate
    const pitchRate = selectedPitch ? parseFloat(String(selectedPitch.hourly_rate)) : 0;
    const pitchCostSar = pitchRate > 0 ? pitchRate : 0;

    // Calculate player share (host plays free)
    const playersPerSide = format ? parseInt(format.split('v')[0]) : 7;
    const maxPlayers = playersPerSide * 2;
    const playerShare = maxPlayers > 1 ? Math.ceil(pitchCostSar / (maxPlayers - 1)) : pitchCostSar;

    /* ── Handlers ────────────────────────────────── */

    const handleModeChange = (newMode: 'koralink' | 'self') => {
        setMode(newMode);
        // Reset venue/pitch/slot/date/time when switching modes (different venue pools)
        setSelectedVenue(null);
        setSelectedPitch(null);
        setSelectedSlot(null);
        setDate('');
        setTime('');
    };

    const handlePublishClick = () => {
        if (!selectedPitch || !date || !time) return;
        setShowWarning(true);
    };

    const doPublish = () => {
        if (!selectedPitch || !date || !time) return;

        const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

        const payload = {
            pitch_id: selectedPitch.id,
            title: title.trim() || t('host.matchTitleFallback', { format, venue: selectedVenue?.name ?? t('host.unknownVenue') }),
            match_type: matchType,
            gender_rule: genderRule,
            scheduled_at: scheduledAt,
            duration_mins: duration,
            max_players: maxPlayers,
            pitchCostSar,
            booking_mode: mode,
            booking_slot_id: mode === 'koralink' ? selectedSlot?.id : undefined,
        };

        createMatch.mutate(payload, {
            onSuccess: () => {
                setShowWarning(false);
                router.push(`/${locale}/play`);
            },
        });
    };

    const canPublish = !!(selectedPitch && date && time
        && (title.length === 0 || title.length >= 3)
        && (mode === 'self' || (mode === 'koralink' && selectedSlot)));

    return (
        <div className="flex flex-col h-full bg-white">
            {/* ══════════════════════════════════════
                HEADER
            ═══════════════════════════════════ */}
            <div className="flex items-center px-4 pt-4 pb-1 relative flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 z-10"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    {t('host.title')}
                </h1>
            </div>

            {/* ══════════════════════════════════════
                MODE TOGGLE
            ═══════════════════════════════════ */}
            <ModeToggle mode={mode} onModeChange={handleModeChange} />

            {/* ══════════════════════════════════════
                SCROLLABLE BODY
            ═══════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto scroll-container pb-44">
                {/* ── VENUE ─────────────────────────── */}
                <div className="px-5 pt-4">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        {t('host.venue')}
                    </p>

                    {/* Selected venue + pitch display */}
                    {selectedVenue ? (
                        <div className="bg-gray-50 rounded-xl p-4 mb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-brand-black">
                                        {selectedVenue.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {selectedVenue.city} • {selectedVenue.pitch_count} {t('clubs.pitches')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedVenue(null);
                                        setSelectedPitch(null);
                                    }}
                                    className="text-xs text-brand-red font-medium"
                                >
                                    {t('host.change')}
                                </button>
                            </div>

                            {/* Pitch selection */}
                            {venueDetail?.pitches && (
                                <PitchSelector
                                    pitches={venueDetail.pitches}
                                    selectedPitch={selectedPitch}
                                    onSelect={(pitch) => {
                                        setSelectedPitch(pitch);
                                        setSelectedSlot(null); // reset slot when pitch changes
                                        // In koralink mode: reset date/time — will be set by slot
                                        if (mode === 'koralink') {
                                            setDate('');
                                            setTime('');
                                        }
                                    }}
                                />
                            )}

                            {/* Slot picker — only in koralink mode */}
                            {mode === 'koralink' && selectedPitch && (
                                <SlotPicker
                                    pitchId={selectedPitch.id}
                                    selectedSlot={selectedSlot}
                                    onSelectSlot={(slot) => {
                                        setSelectedSlot(slot);
                                        // Auto-populate date/time from slot (koralink mode)
                                        if (slot) {
                                            setDate(slot.slot_date);
                                            setTime(slot.start_time.slice(0, 5)); // "HH:MM" from "HH:MM:SS"
                                        } else {
                                            setDate('');
                                            setTime('');
                                        }
                                    }}
                                />
                            )}
                        </div>
                    ) : (
                        /* Search venue button */
                        <button
                            onClick={() => setShowVenuePicker(true)}
                            className="w-full flex items-center gap-3 py-3 group"
                        >
                            <MapPin
                                className="w-5 h-5 text-brand-green flex-shrink-0"
                                strokeWidth={2}
                                fill="currentColor"
                            />
                            <span className="flex-1 text-start text-sm text-gray-400">
                                {mode === 'koralink'
                                    ? t('host.searchPartnerVenues')
                                    : t('host.searchVenuesPlaceholder')
                                }
                            </span>
                            <ChevronRight className="w-4 h-4 text-gray-300" strokeWidth={2} />
                        </button>
                    )}

                    {/* Mode-specific disclaimer */}
                    <div className={`mt-3 rounded-xl p-3.5 flex items-start gap-3 ${
                        mode === 'self'
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-brand-green/5 border border-brand-green/20'
                    }`}>
                        {mode === 'self' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        ) : (
                            <Shield className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" strokeWidth={2} />
                        )}
                        <p className="text-xs text-gray-600 leading-relaxed">
                            <span className="font-bold text-gray-700">
                                {mode === 'self' ? t('host.disclaimer') : t('host.viaUsDescription')}
                            </span>{' '}
                            {mode === 'self' ? t('host.disclaimerText') : ''}
                        </p>
                    </div>
                </div>

                {/* ── SHARED MATCH DETAILS ──────────── */}
                <MatchDetailsForm
                    title={title} setTitle={setTitle}
                    format={format} setFormat={setFormat}
                    matchType={matchType} setMatchType={setMatchType}
                    genderRule={genderRule} setGenderRule={setGenderRule}
                    date={date} setDate={setDate}
                    time={time} setTime={setTime}
                    duration={duration} setDuration={setDuration}
                    readOnlyDateTime={mode === 'koralink' && !!selectedSlot}
                />
            </div>

            {/* ══════════════════════════════════════
                STICKY FOOTER
            ═══════════════════════════════════ */}
            <CostFooter
                selectedPitch={!!selectedPitch}
                pitchCostSar={pitchCostSar}
                playerShare={playerShare}
                canPublish={canPublish}
                isPending={createMatch.isPending}
                isError={createMatch.isError}
                hasSlot={mode === 'self' ? undefined : !!selectedSlot}
                onPublish={handlePublishClick}
            />

            {/* ══════════════════════════════════════
                VENUE PICKER MODAL
            ═══════════════════════════════════ */}
            <VenuePickerSheet
                open={showVenuePicker}
                onClose={() => setShowVenuePicker(false)}
                onSelect={(venue) => {
                    setSelectedVenue(venue);
                    setSelectedPitch(null);
                }}
                filterPartnerOnly={mode === 'koralink'}
            />

            {/* ══════════════════════════════════════
                PUBLISH WARNING SHEET
            ═══════════════════════════════════ */}
            <PublishWarningSheet
                open={showWarning}
                mode={mode}
                onConfirm={doPublish}
                onCancel={() => setShowWarning(false)}
                isPending={createMatch.isPending}
            />
        </div>
    );
}
