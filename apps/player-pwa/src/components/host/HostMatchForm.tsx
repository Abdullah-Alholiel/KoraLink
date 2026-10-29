'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, MapPin, ChevronRight, AlertTriangle, Shield, History } from 'lucide-react';
import { useCreateMatch } from '@/hooks/useMatches';
import { useWalletBalance } from '@/hooks/useWallet';
import { useVenue, type VenueApi, type PitchApi } from '@/hooks/useVenues';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { pitchCostForDuration, pricePerPlayer } from '@/lib/match-pricing';
import { riyadhISO, parseHostDateParam } from '@/lib/riyadh-time';
import { classifyPublishError, PUBLISH_ERROR_KEYS, parseWalletShortfall, computeShortfall } from '@/lib/publish-error';
import {
    loadHostDraft,
    saveHostDraft,
    clearHostDraft,
    type HostDraft,
} from '@/lib/host-draft';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { useAppStore, selectUser } from '@/store/useAppStore';

import ModeToggle from './ModeToggle';
import MatchDetailsForm, {
    type Format,
    type GenderRule,
    type MatchTypeValue,
    GENDER_OPTIONS,
    MATCH_TYPES,
} from './MatchDetailsForm';
import VenuePickerSheet from './VenuePickerSheet';
import PitchSelector from './PitchSelector';
import SlotPicker from './SlotPicker';
import CostFooter from './CostFooter';
import PublishWarningSheet from './PublishWarningSheet';
import VisibilityToggle, { type Visibility } from './VisibilityToggle';
import type { PitchSlotApi } from '@/hooks/usePitchSlots';

// P1-64 weekly-repeat chips: value = number of weekly instances to book.
const REPEAT_OPTIONS = [
    { weeks: 1, key: 'host.repeat.once' },
    { weeks: 2, key: 'host.repeat.weekly2' },
    { weeks: 4, key: 'host.repeat.weekly4' },
    { weeks: 6, key: 'host.repeat.weekly6' },
    { weeks: 8, key: 'host.repeat.weekly8' },
] as const;

export default function HostMatchForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = useLocale();
    const t = useTranslations();
    const createMatch = useCreateMatch();
    // P2-177: proactive offline cue for the slot picker (5-UX-states).
    const isOnline = useOnlineStatus();

    /* ── Venue pre-select from query params ─────────── */
    const venueIdFromQuery = searchParams?.get('venue');
    const venueNameFromQuery = searchParams?.get('venueName');

    /* ── Date pre-select from query params (club calendar → "Host Here") ──
     * Validated: YYYY-MM-DD, today-or-later in Riyadh. Past/garbage → null. */
    const dateFromQuery = parseHostDateParam(searchParams?.get('date'));

    /* ── Mode State ────────────────────────────────
     * Product default: "Book via Us" (koralink) — every entry into the host
     * flow opens in koralink mode; the host must actively switch to "Book by
     * Yourself". Backend layers (client Zod schema, API service fallback,
     * DTO/Swagger, DB column default) all mirror this default. */
    const [mode, setMode] = useState<'koralink' | 'self'>('koralink');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [showWarning, setShowWarning] = useState(false);
    /* ── Form State ─────────────────────────────── */
    const [showVenuePicker, setShowVenuePicker] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState<VenueApi | null>(() => {
        if (venueIdFromQuery) {
            return {
                id: venueIdFromQuery,
                name: venueNameFromQuery || '',
                city: '',
                address: '',
                amenities: [],
                is_approved: false,
                is_koralink_partner: false,
                distance_m: null,
                owner_id: '',
                owner_name: null,
                pitch_count: 0,
            };
        }
        return null;
    });
    const [selectedPitch, setSelectedPitch] = useState<PitchApi | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<PitchSlotApi | null>(null);
    // P1-64: weekly repeat count (koralink + slot only). 1 = single match.
    const [repeatWeeks, setRepeatWeeks] = useState(1);

    const { data: venueDetail } = useVenue(selectedVenue?.id ?? null);

    // Sync venueDetail into selectedVenue when pre-selected venue loads
    useEffect(() => {
        if (venueDetail && venueIdFromQuery) {
            setSelectedVenue(venueDetail);
        }
    }, [venueDetail, venueIdFromQuery]);

    const [title, setTitle] = useState('');
    const [format, setFormat] = useState<Format>('7v7');
    const [matchType, setMatchType] = useState<MatchTypeValue>('Casual');
    const [genderRule, setGenderRule] = useState<GenderRule>('Men Only');
    const [duration, setDuration] = useState(60);

    // Format is ALWAYS derived from the selected pitch (US4). While no pitch
    // is chosen the free picker is unavailable — pick a pitch first.
    const effectiveFormat = (selectedPitch?.size as Format | undefined) ?? null;
    useEffect(() => {
        if (effectiveFormat && effectiveFormat !== format) {
            setFormat(effectiveFormat);
        }
    }, [effectiveFormat]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Compute match duration in minutes from a slot's start_time and end_time.
     *  Handles overnight slots (end < start) by wrapping around 24h. */
    const computeSlotDuration = (slot: PitchSlotApi): number => {
        const [startH, startM] = slot.start_time.split(':').map(Number);
        const [endH, endM] = slot.end_time.split(':').map(Number);
        let mins = (endH * 60 + endM) - (startH * 60 + startM);
        if (mins <= 0) mins += 24 * 60;
        return mins;
    };
    const [date, setDate] = useState(dateFromQuery ?? '');
    const [time, setTime] = useState('');

    // ── P2-281 M-3: local draft recovery ────────────────────────────────
    // Restore runs in a POST-HYDRATION effect (PR-Agent run-#196 r1): a
    // render-path restore diverged the server HTML (no draft — localStorage
    // is client-only) from the client's hydration render (draft restored →
    // banner + filled fields), logging a hydration error on direct /host
    // landings. Post-hydration costs one extra render, zero mismatch.
    // Declared BEFORE the save effect below so the restore's setStates beat
    // the first snapshot; the armed-ref then suppresses that pre-restore
    // save pass exactly once. StrictMode double-invoke is idempotent (same
    // values re-applied). Venue/pitch/slot are deliberately NOT restored
    // (booking intent goes stale — see host-draft.ts).
    const [draftRestored, setDraftRestored] = useState<HostDraft | null>(null);
    // Owner binding (PR-Agent run-#196 r3 MINOR): the draft replays ONLY for
    // the session that authored it — on a shared device the next user's
    // /host must never inherit another player's pre-filled match. The store
    // rehydrates async, so the restore keys on the HYDRATED id (runs once
    // the id exists; a null id no-ops). Mirrors the offline chat queue's
    // userId rule (koralink-frontend-patterns §offline-queue).
    const storeUser = useAppStore(selectUser);
    const currentUserId = storeUser?.id ?? '';
    const draftRestoreAppliedRef = useRef(false);
    useEffect(() => {
        if (draftRestoreAppliedRef.current || !currentUserId) return;
        const d = loadHostDraft(currentUserId);
        if (!d) return;
        draftRestoreAppliedRef.current = true;
        setTitle(d.title);
        // Component-side re-check against the LIVE option lists: if the lib
        // mirrors ever drift, an out-of-union value would light up no chip.
        setMatchType(
            MATCH_TYPES.includes(d.matchType as MatchTypeValue)
                ? (d.matchType as MatchTypeValue)
                : 'Casual',
        );
        setGenderRule(
            GENDER_OPTIONS.includes(d.genderRule as GenderRule)
                ? (d.genderRule as GenderRule)
                : 'Men Only',
        );
        // Fresh intent wins: a club-calendar ?date= beats the draft's date.
        if (!dateFromQuery) setDate(d.date);
        if (d.time) setTime(d.time);
        if (d.duration !== duration) setDuration(d.duration);
        if (d.visibility === 'private') setVisibility('private');
        setDraftRestored(d);
        // Mount-lifetime restore: re-runs only while the id is still absent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUserId]);
    // Hosting-terms consent (cycle player-host-responsibility): reset per
    // publish attempt; the publish button stays disabled until accepted and
    // the flag is sent to the API, which independently rejects booking
    // without it (defense in depth — client gate + server gate).
    const [hostingConsent, setHostingConsent] = useState(false);
    useEffect(() => {
        if (!showWarning) setHostingConsent(false);
    }, [showWarning]);

    // ── P2-281 M-3: persist the shared text fields on every change ──────
    // The restore effect (declared above) runs FIRST on mount, so the first
    // pass here carries the pre-restore closure values — suppressed once,
    // then armed. After the restore's setStates re-run this effect, storage
    // converges to the restored state; every later user change re-saves.
    const draftSaveArmedRef = useRef(false);
    useEffect(() => {
        if (!draftSaveArmedRef.current) {
            draftSaveArmedRef.current = true;
            return;
        }
        if (!currentUserId) return;
        saveHostDraft({ userId: currentUserId, title, matchType, genderRule, date, time, duration, visibility });
    }, [currentUserId, title, matchType, genderRule, date, time, duration, visibility]);

    // Derive pitch cost from the selected pitch's hourly rate, prorated by
    // duration (mirrors the server's authoritative calculation — the server
    // ignores any client-sent pitchCostSar).
    const pitchRate = selectedPitch ? parseFloat(String(selectedPitch.hourly_rate)) : 0;
    const pitchCostSar = pitchRate > 0 ? pitchCostForDuration(pitchRate, duration) : 0;

    // Calculate per-player share (host plays free) — mirrors the backend's
    // calculatePricePerPlayer, INCLUDING the platform margin, so the footer
    // matches what players are actually charged.
    const playersPerSide = effectiveFormat ? parseInt(effectiveFormat.split('v')[0]) : 0;
    const maxPlayers = playersPerSide * 2;
    const playerShare = maxPlayers > 1 ? pricePerPlayer(pitchCostSar, maxPlayers) : pitchCostSar;

    /* ── Wallet deposit pre-check (koralink mode) ───────────────────
     * The API debits the FULL pitch cost from the host's wallet at publish
     * (and refunds it in full on cancel / underfill auto-cancel). The sheet
     * shows the deposit up front and blocks publishing when the balance is
     * short — with the exact deficit and a top-up route. The balance query
     * only runs while the sheet is open in koralink mode. */
    const wallet = useWalletBalance({ enabled: showWarning && mode === 'koralink' });
    // P1-64: the API debits the pitch cost once PER weekly instance, so the
    // deposit (and the shortfall pre-check below) covers all repeats.
    const depositSar = mode === 'koralink' && pitchCostSar > 0 ? pitchCostSar * repeatWeeks : null;
    const walletBalanceSar = wallet.data != null ? wallet.data.balance : null;
    const shortBy = depositSar != null && walletBalanceSar != null
        ? computeShortfall(depositSar, walletBalanceSar)
        : 0;

    /* ── Handlers ────────────────────────────────── */

    const handleModeChange = (newMode: 'koralink' | 'self') => {
        setMode(newMode);
        // Reset venue/pitch/slot when switching modes (different venue pools)
        setSelectedVenue(null);
        setSelectedPitch(null);
        setSelectedSlot(null);
        setRepeatWeeks(1);
        // Re-apply the club-calendar date (if any) — the user's intent "I want
        // this day" is mode-independent. Slot-driven dates re-set themselves
        // once a slot is picked.
        setDate(dateFromQuery ?? '');
        setTime('');
    };

    const handlePublishClick = () => {
        if (!selectedPitch || !date || !time) return;
        setShowWarning(true);
    };

    const doPublish = () => {
        if (!selectedPitch || !date || !time) return;

        const scheduledAt = riyadhISO(date, time);

        const payload = {
            pitch_id: selectedPitch.id,
            title: title.trim() || t('host.matchTitleFallback', { format: effectiveFormat ?? '7v7', venue: selectedVenue?.name ?? t('host.unknownVenue') }),
            match_type: matchType,
            gender_rule: genderRule,
            scheduled_at: scheduledAt,
            duration_mins: duration,
            max_players: maxPlayers,
            pitchCostSar,
            booking_mode: mode,
            booking_slot_id: mode === 'koralink' ? selectedSlot?.id : undefined,
            repeat_weeks: repeatWeeks > 1 ? repeatWeeks : undefined,
            visibility,
            acceptedHostingTerms: hostingConsent,
        };

        createMatch.mutate(payload, {
            onSuccess: (createdMatch) => {
                setShowWarning(false);
                // P2-281 M-3: the match exists — the draft's job is done.
                clearHostDraft();
                // P2-258: the host just published — arm the contextual push
                // opt-in offer on the match page they land on.
                useAppStore.getState().armPushNudge();
                // Replace (not push) — the host form must NOT remain in history.
                // Back from the match detail returns to where the user came
                // from (Play/Club), never back to a filled-out form.
                router.replace(`/${locale}/match/${createdMatch.id}`);
            },
        });
    };

    const canPublish = !!(selectedPitch && date && time
        && (title.length === 0 || title.length >= 3)
        && (mode === 'self' || (mode === 'koralink' && selectedSlot)));

    // Classified publish error shown inside the warning sheet (localized, at
    // the moment of failure — not a generic toast). A server-confirmed
    // insufficient-balance 400 carries the exact Required/Available amounts —
    // parsed here so the sheet can show the precise deficit even when the
    // proactive pre-check raced (balance changed mid-flow).
    const publishErrorKind = createMatch.isError
        ? classifyPublishError(createMatch.error)
        : null;
    const publishErrorKey = publishErrorKind
        ? PUBLISH_ERROR_KEYS[publishErrorKind]
        : null;
    const serverShortfall = publishErrorKind === 'insufficient_balance' && createMatch.error
        ? parseWalletShortfall(String((createMatch.error as { message?: string }).message ?? ''))
        : null;

    // Observability (AGENTS.md §4): the deposit wall is a funnel choke point —
    // track every block with the exact amounts so product can size the impact.
    const proactiveShort = depositSar != null
        && walletBalanceSar != null
        && walletBalanceSar < depositSar;
    useEffect(() => {
        if (showWarning && proactiveShort) {
            trackEvent('publish_blocked_insufficient_balance', {
                phase: 'precheck',
                deposit_sar: depositSar,
                wallet_balance_sar: walletBalanceSar,
                shortfall_sar: shortBy,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showWarning, proactiveShort]);
    useEffect(() => {
        if (publishErrorKind === 'insufficient_balance') {
            trackEvent('publish_blocked_insufficient_balance', {
                phase: 'server_error',
                deposit_sar: serverShortfall?.requiredSar ?? depositSar ?? null,
                wallet_balance_sar: serverShortfall?.availableSar ?? walletBalanceSar ?? null,
                shortfall_sar: serverShortfall?.shortfallSar ?? shortBy ?? null,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publishErrorKind]);

    const handleTopUp = () => {
        createMatch.reset();
        setShowWarning(false);
        // Push (not replace) — the host returns from the wallet to this
        // filled-out form to retry publishing.
        router.push(`/${locale}/wallet`);
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* ══════════════════════════════════════
                HEADER
            ═══════════════════════════════════ */}
            <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-1 relative flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 z-10"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
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
                VISIBILITY (public / private) — shared by both modes
            ═══════════════════════════════════ */}
            <VisibilityToggle value={visibility} onChange={setVisibility} />

            {/* ── P2-281 M-3: draft-restored banner ──────────────────── */}
            {draftRestored && (
                <div
                    role="status"
                    data-testid="host-draft-restored"
                    className="mx-4 mt-3 rounded-xl bg-brand-green/5 border border-brand-green/20 px-4 py-3 flex items-center gap-3"
                >
                    <History className="w-4 h-4 text-brand-green flex-shrink-0" strokeWidth={2} />
                    <p className="flex-1 text-xs text-gray-600">
                        {t('host.draftRestored')}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            clearHostDraft();
                            setDraftRestored(null);
                            setTitle('');
                            setMatchType('Casual');
                            setGenderRule('Men Only');
                            if (!dateFromQuery) setDate('');
                            setTime('');
                            setDuration(60);
                            setVisibility('public');
                        }}
                        className="text-xs font-bold text-brand-red flex-shrink-0 active:scale-95 transition-transform"
                    >
                        {t('host.draftDiscard')}
                    </button>
                </div>
            )}

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

                            {/* Pitch selection — collapses to a locked summary once chosen */}
                            {venueDetail?.pitches && (
                                <PitchSelector
                                    pitches={venueDetail.pitches}
                                    selectedPitch={selectedPitch}
                                    onSelect={(pitch) => {
                                        setSelectedPitch(pitch);
                                        setSelectedSlot(null); // reset slot when pitch changes
                                        // In koralink mode: reset time (slot re-sets both);
                                        // re-apply the club-calendar date if present.
                                        if (mode === 'koralink') {
                                            setDate(dateFromQuery ?? '');
                                            setTime('');
                                        }
                                    }}
                                    onClear={() => setSelectedPitch(null)}
                                />
                            )}

                            {/* Slot picker — only in koralink mode */}
                            {mode === 'koralink' && selectedPitch && (
                                <>
                                {/* P2-177: offline strip BEFORE the picker — a host on
                                    stadium Wi-Fi sees WHY no slots load instead of a
                                    silent spinner (context copy via the shared banner). */}
                                {!isOnline && (
                                    <OfflineBanner
                                        isOffline
                                        message={t('host.slotsOffline')}
                                        className="mb-2 mx-0"
                                    />
                                )}
                                <SlotPicker
                                    pitchId={selectedPitch.id}
                                    selectedSlot={selectedSlot}
                                    onSelectSlot={(slot) => {
                                        setSelectedSlot(slot);
                                        // Auto-populate date/time from slot (koralink mode)
                                        if (slot) {
                                            setDate(slot.slot_date);
                                            setTime(slot.start_time.slice(0, 5)); // "HH:MM" from "HH:MM:SS"
                                            setDuration(computeSlotDuration(slot)); // lock duration to slot window
                                        } else {
                                            setDate('');
                                            setTime('');
                                            setRepeatWeeks(1);
                                        }
                                    }}
                                />
                                </>
                            )}

                            {/* Weekly repeat (P1-64) — only once a KoraLink slot is picked */}
                            {mode === 'koralink' && selectedSlot && (
                                <div role="group" data-testid="repeat-chips" className="flex flex-wrap gap-2 mt-3">
                                    {REPEAT_OPTIONS.map(({ weeks, key }) => (
                                        <button
                                            key={weeks}
                                            type="button"
                                            aria-pressed={repeatWeeks === weeks}
                                            onClick={() => setRepeatWeeks(weeks)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                                repeatWeeks === weeks
                                                    ? 'bg-brand-green text-white border-brand-green'
                                                    : 'bg-white text-gray-600 border-gray-200'
                                            }`}
                                        >
                                            {t(key)}
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
                    lockedFormat={effectiveFormat ?? undefined}
                    matchType={matchType} setMatchType={setMatchType}
                    genderRule={genderRule} setGenderRule={setGenderRule}
                    date={date} setDate={setDate}
                    time={time} setTime={setTime}
                    duration={duration} setDuration={setDuration}
                    readOnlyDateTime={mode === 'koralink' && !!selectedSlot}
                    readOnlyDuration={mode === 'koralink' && !!selectedSlot}
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

            {/* ═══════════════════════════════════════
                PUBLISH WARNING SHEET
            ═══════════════════════════════════════ */}
            <PublishWarningSheet
                open={showWarning}
                mode={mode}
                errorKey={publishErrorKey}
                depositSar={depositSar}
                repeatWeeks={repeatWeeks}
                walletBalanceSar={serverShortfall?.availableSar ?? walletBalanceSar}
                balanceResolved={wallet.isSuccess}
                serverShortfallSar={serverShortfall?.shortfallSar ?? null}
                consentAccepted={hostingConsent}
                onConsentChange={setHostingConsent}
                onTopUp={handleTopUp}
                onConfirm={doPublish}
                onCancel={() => {
                    createMatch.reset();
                    setShowWarning(false);
                }}
                isPending={createMatch.isPending}
            />
        </div>
    );
}
