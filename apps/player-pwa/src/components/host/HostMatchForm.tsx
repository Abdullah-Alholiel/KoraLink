'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
    ArrowLeft,
    MapPin,
    ChevronRight,
    Lock,
    Calendar,
    Clock,
    AlertTriangle,
    Info,
    ArrowRight,
    Sparkles,
    Loader2,
    Search,
} from 'lucide-react';
import { useCreateMatch } from '@/hooks/useMatches';
import { useVenues, useVenue, type VenueApi, type PitchApi } from '@/hooks/useVenues';

/* ── Format options ─────────────────────────────── */
const FORMAT_OPTIONS = ['5v5', '7v7', '8v8', '11v11'] as const;
type Format = (typeof FORMAT_OPTIONS)[number];

/* ── Booking mode ───────────────────────────────── */
type BookingMode = 'koralink' | 'self';

export default function HostMatchForm() {
    const router = useRouter();
    const locale = useLocale();
    const createMatch = useCreateMatch();

    /* ── Venue / Pitch Selection ─────────────────── */
    const [showVenuePicker, setShowVenuePicker] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState<VenueApi | null>(null);
    const [selectedPitch, setSelectedPitch] = useState<PitchApi | null>(null);
    const [venueSearch, setVenueSearch] = useState('');

    const { data: venues, isLoading: venuesLoading } = useVenues(
        venueSearch ? { city: venueSearch } : undefined,
    );
    const { data: venueDetail } = useVenue(selectedVenue?.id ?? null);

    /* ── Form State ─────────────────────────────── */
    const [title, setTitle] = useState('');
    const [format, setFormat] = useState<Format>('7v7');
    const [matchType, setMatchType] = useState<'Casual' | 'Competitive'>('Casual');
    const [genderRule, setGenderRule] = useState<'Men Only' | 'Women Only' | 'Mixed'>('Men Only');
    const [duration, setDuration] = useState(60);
    const [bookingMode, setBookingMode] = useState<BookingMode>('self');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    // Derive cost from selected pitch's hourly rate
    const pitchRate = selectedPitch ? parseFloat(String(selectedPitch.hourly_rate)) : 0;
    const pitchCostSar = pitchRate > 0 ? pitchRate : 0;

    // Calculate player share (host plays free)
    const maxPlayers = format ? parseInt(format.charAt(0)) * 2 : 14;
    const playerShare = maxPlayers > 1 ? Math.ceil(pitchCostSar / (maxPlayers - 1)) : pitchCostSar;

    const handlePublish = () => {
        if (!selectedPitch || !date || !time) return;

        const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

        const payload = {
            pitch_id: selectedPitch.id,
            title: title.trim() || `${format} Match at ${selectedVenue?.name ?? 'Venue'}`,
            match_type: matchType,
            gender_rule: genderRule,
            scheduled_at: scheduledAt,
            duration_mins: duration,
            max_players: maxPlayers,
            pitchCostSar,
        };

        createMatch.mutate(payload, {
            onSuccess: () => {
                router.push(`/${locale}/play`);
            },
        });
    };

    const canPublish = selectedPitch && date && time && (title.length === 0 || title.length >= 3);

    return (
        <div className="flex flex-col h-full bg-white">
            {/* ══════════════════════════════════════
                HEADER
            ═══════════════════════════════════ */}
            <div className="flex items-center px-4 pt-4 pb-3 relative flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 z-10"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    Host a Match
                </h1>
            </div>

            {/* ══════════════════════════════════════
                SCROLLABLE BODY
            ═══════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto scroll-container pb-44">
                {/* ── VENUE ─────────────────────────── */}
                <div className="px-5 pt-4">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Venue
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
                                        {selectedVenue.city} • {selectedVenue.pitch_count} pitches
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedVenue(null);
                                        setSelectedPitch(null);
                                    }}
                                    className="text-xs text-brand-red font-medium"
                                >
                                    Change
                                </button>
                            </div>

                            {/* Pitch selection */}
                            {venueDetail?.pitches && venueDetail.pitches.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                        Select a pitch
                                    </p>
                                    {venueDetail.pitches.map((pitch) => (
                                        <button
                                            key={pitch.id}
                                            onClick={() => setSelectedPitch(pitch)}
                                            className={`w-full text-start p-3 rounded-lg border transition-all ${
                                                selectedPitch?.id === pitch.id
                                                    ? 'border-brand-green bg-brand-green/5'
                                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-brand-black">
                                                    {pitch.name}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    SAR {pitch.hourly_rate}/hr
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {pitch.size} • {pitch.surface_type}
                                                {pitch.environment ? ` • ${pitch.environment}` : ''}
                                            </p>
                                        </button>
                                    ))}
                                </div>
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
                                Search venues in Riyadh...
                            </span>
                            <ChevronRight className="w-4 h-4 text-gray-300" strokeWidth={2} />
                        </button>
                    )}

                    {/* Booking mode tabs */}
                    <div className="flex rounded-full border border-gray-200 overflow-hidden mt-2">
                        <button
                            onClick={() => setBookingMode('koralink')}
                            className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all ${
                                bookingMode === 'koralink'
                                    ? 'bg-brand-green text-white'
                                    : 'bg-white text-gray-500'
                            }`}
                        >
                            Book via KoraLink
                        </button>
                        <button
                            onClick={() => setBookingMode('self')}
                            className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all ${
                                bookingMode === 'self'
                                    ? 'bg-brand-green text-white'
                                    : 'bg-white text-gray-500'
                            }`}
                        >
                            I have booked it
                        </button>
                    </div>

                    {/* Disclaimer */}
                    <div
                        className={`mt-3 rounded-xl p-3.5 flex items-start gap-3 ${
                            bookingMode === 'self'
                                ? 'bg-amber-50 border border-amber-200'
                                : 'bg-blue-50 border border-blue-200'
                        }`}
                    >
                        {bookingMode === 'self' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        ) : (
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        )}
                        <p className="text-xs text-gray-600 leading-relaxed">
                            {bookingMode === 'self' ? (
                                <>
                                    <span className="font-bold text-gray-700">Disclaimer:</span>{' '}
                                    By selecting this, you confirm the pitch is fully secured.
                                    If the venue is unavailable at kick-off, your account will be
                                    held strictly liable to refund all paying players.
                                </>
                            ) : (
                                <>
                                    <span className="font-bold text-gray-700">Concierge Booking:</span>{' '}
                                    A KoraLink agent will text you within 1-2 hours to confirm your pitch.
                                    If the pitch is unavailable, your payment will be fully refunded
                                    to your KoraLink wallet credits.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {/* ── MATCH TITLE ─────────────────── */}
                <div className="px-5 pt-4">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Match Title
                    </p>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Friday Night 7v7"
                        maxLength={255}
                        className="w-full bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 text-sm
                            text-brand-black placeholder:text-gray-400 outline-none focus:border-brand-green transition-colors"
                    />
                    {title.length > 0 && title.length < 3 && (
                        <p className="text-xs text-brand-red mt-1">Title must be at least 3 characters</p>
                    )}
                </div>

                {/* ── FORMAT ────────────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Format
                    </p>
                    <div className="flex gap-2">
                        {FORMAT_OPTIONS.map((f) => (
                            <button
                                key={f}
                                onClick={() => setFormat(f)}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                    format === f
                                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── MATCH TYPE ──────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Match Type
                    </p>
                    <div className="flex gap-2">
                        {(['Casual', 'Competitive'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setMatchType(t)}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                    matchType === t
                                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── GENDER ────────────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Gender
                    </p>
                    <div className="flex gap-2">
                        {(['Men Only', 'Women Only', 'Mixed'] as const).map((g) => (
                            <button
                                key={g}
                                onClick={() => setGenderRule(g)}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all border active:scale-95 ${
                                    genderRule === g
                                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── DATE & TIME ───────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Date & Time
                    </p>
                    <div className="flex gap-3">
                        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-3.5 relative">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date</p>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                <span className="text-sm font-bold text-brand-black">
                                    {date
                                        ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric',
                                        })
                                        : 'Select date'}
                                </span>
                            </div>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-3.5 relative">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Time</p>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                <span className="text-sm font-bold text-brand-black">
                                    {time
                                        ? new Date(`2025-01-01T${time}`).toLocaleTimeString('en-US', {
                                            hour: 'numeric', minute: '2-digit', hour12: true,
                                        })
                                        : 'Select time'}
                                </span>
                            </div>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* ── DURATION ─────────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Duration
                    </p>
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
                </div>

                {/* ── PUBLIC MATCH TOGGLE ───────────── */}
                <div className="px-5 pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                                <Lock className="w-4 h-4 text-gray-500" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-black">Public Match</p>
                                <p className="text-xs text-gray-400">Anyone can join</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════
                STICKY FOOTER
            ═══════════════════════════════════ */}
            <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 pt-3 pb-5 animate-slide-in-bottom">
                {/* Cost row */}
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">Player share:</span>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-black">SAR {playerShare}</span>
                        <span className="inline-flex items-center gap-1 bg-brand-green/10 text-brand-green text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <Sparkles className="w-3 h-3" strokeWidth={2} />
                            HOST PLAYS FREE
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-gray-400">Pitch cost:</span>
                    <span className="text-base font-extrabold text-brand-black">
                        SAR {pitchCostSar.toFixed(2)}
                    </span>
                </div>

                {/* Publish CTA */}
                <button
                    onClick={handlePublish}
                    disabled={createMatch.isPending || !canPublish}
                    className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                        flex items-center justify-center gap-2
                        shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                        active:scale-[0.98] transition-transform
                        disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    {createMatch.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                            Publishing...
                        </>
                    ) : (
                        <>
                            {selectedPitch ? 'Publish Match' : 'Select a venue to continue'}
                            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                        </>
                    )}
                </button>

                {createMatch.isError && (
                    <p className="text-xs text-brand-red mt-2 text-center">
                        {createMatch.error instanceof Error
                            ? createMatch.error.message
                            : 'Failed to create match. Please try again.'}
                    </p>
                )}
            </div>

            {/* ══════════════════════════════════════
                VENUE PICKER MODAL
            ═══════════════════════════════════ */}
            {showVenuePicker && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowVenuePicker(false)} />
                    <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 max-h-[70vh] overflow-y-auto animate-slide-up">
                        <div className="flex justify-center pt-3 pb-2">
                            <div className="w-10 h-1 rounded-full bg-gray-300" />
                        </div>
                        <div className="px-5 pb-6">
                            <h2 className="text-lg font-bold text-brand-black mb-4">Select a Venue</h2>

                            {/* Search */}
                            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors mb-4">
                                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                                <input
                                    type="text"
                                    value={venueSearch}
                                    onChange={(e) => setVenueSearch(e.target.value)}
                                    placeholder="Search by city..."
                                    className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                                />
                            </div>

                            {/* Venue list */}
                            {venuesLoading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : venues && venues.length > 0 ? (
                                <div className="space-y-2">
                                    {venues.map((venue) => (
                                        <button
                                            key={venue.id}
                                            onClick={() => {
                                                setSelectedVenue(venue);
                                                setSelectedPitch(null);
                                                setShowVenuePicker(false);
                                            }}
                                            className="w-full text-start p-4 rounded-xl border border-gray-200 hover:border-brand-green transition-colors"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-brand-black">{venue.name}</p>
                                                    <p className="text-xs text-gray-500">{venue.city} • {venue.pitch_count} pitches</p>
                                                </div>
                                                <div className="text-end">
                                                    <span className="text-xs font-bold text-brand-green">
                                                        ★ {venue.rating.toFixed(1)}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-sm text-gray-400">No venues found{venueSearch ? ` in "${venueSearch}"` : ''}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
