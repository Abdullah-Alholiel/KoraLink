'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  ArrowLeft,
  MapPin,
  Star,
  Calendar,
  Clock,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import { useVenue } from '@/hooks/useVenues';
import { useMatches } from '@/hooks/useMatches';
import { useNow } from '@/hooks/useNow';
import MatchDateSections from '@/components/matches/MatchDateSections';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import DatePicker from '@/components/matches/DatePicker';
import { dateInRiyadh } from '@/lib/api-adapter';
import { classifyError, errorKey } from '@/lib/error-classify';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { isVenueOpenNow } from '@/lib/venue-hours';
import { selectUser, useAppStore } from '@/store/useAppStore';
import BottomSheet from '@/components/layout/BottomSheet';

// ── Helpers ────────────────────────────────────────────────

/** Hourly pitch rate display (numeric column arrives as string from Drizzle). */
const hourlyRateFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 2,
});

function formatDateLabel(
  date: Date,
  t: (k: string) => string,
  locale: string,
  nowMs: number,
): string {
  // Hydration-safe clock (run #50, P2-59): `now` passed in from the
  // component's useNow(); pre-mount (0) never matches a real day, so the
  // label falls through to the localized date instead of a Today/Tomorrow
  // that could disagree between server and device. Previously new Date().
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  // P2-35 (run #21): locale-aware — Arabic users get ar-SA weekdays/months
  // (mirrors RescheduleSheet dayLabel / MatchDetailsForm).
  const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  if (diff === 0) return t('clubs.today');
  if (diff === 1) return t('clubs.tomorrow');
  if (diff < 7) return d.toLocaleDateString(dateLocale, { weekday: 'long' });
  return d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
}

// ── Amenity icons ──────────────────────────────────────────

const AMENITY_ICONS: Record<string, string> = {
  parking: '🅿️',
  changing_rooms: '👕',
  floodlights: '💡',
  cafe: '☕',
  water_cooler: '💧',
  gym: '🏋️',
  indoor: '🏠',
  wifi: '📶',
};

export default function ClubPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/')[1] || 'en';
  const t = useTranslations();

  // Hydration-safe wall clock (P2-59, run #50): null during SSR and the first
  // client render; 0 never matches a real day, so the chip label falls through
  // to the plain localized date until the clock effect lands.
  const clubNowMs = useNow() ?? 0;

  const { data: venue, isLoading, error } = useVenue(id);

  // ── Date filter state — null = "all games" first-look (matches Play) ──
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  // Use Asia/Riyadh local day (NOT UTC) — same as the Play feed's dateInRiyadh.
  const dateStr = selectedDate ? dateInRiyadh(selectedDate) : null;

  // ── Fetch matches for this venue ──────────────────────────
  // No date → ALL upcoming matches (grouped by day). A date → that day only.
  // useMatches returns adapted Match[] already — do NOT re-adapt
  // (P1-46, run #51: the hook's error/refetch are consumed — a failed
  // match-list fetch must never masquerade as "no games scheduled").
  const {
    matches,
    isLoading: matchesLoading,
    error: matchesError,
    refetch: refetchMatches,
  } = useMatches({
    date: dateStr,
    venue_id: id,
  });

  const storeUser = useAppStore(selectUser);
  const currentUserId = storeUser?.id;

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  }, []);

  const handleClearDate = useCallback(() => {
    setSelectedDate(null);
    setShowCalendar(false);
  }, []);

  // Staleness signal for the SW-cached club surface (run #52): the club page
  // is the last main PWA surface without an offline affordance — a stale
  // cached list must never read as live data.
  const isOnline = useOnlineStatus();

  // ── Scroll parallax ─────────────────────────────────────

  return (
    <MobileFrame>
      <OfflineBanner isOffline={!isOnline} className="mx-4 mt-2" />
      {/* ── Header ── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[var(--top-safe-inset)] pb-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-white absolute left-1/2 -translate-x-1/2 truncate max-w-[60%]">
          {isLoading ? '' : venue?.name ?? t('clubs.venue')}
        </h1>
        <div className="w-9" /> {/* spacer */}
      </div>

      <div className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* ── Error ── */}
        {error && !isLoading && (
          <div className="flex flex-col items-center py-20 px-8">
            <AlertTriangle className="w-10 h-10 text-brand-red" strokeWidth={1.5} />
            <p className="text-sm text-gray-400 mt-3">{t('clubs.error')}</p>
          </div>
        )}

        {venue && (
          <>
            {/* ════ HERO — Stadium Background ════ */}
            <div className="relative h-48 overflow-hidden">
              <Image
                src="/images/stadium-bg.png"
                alt={venue.name}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />

              {/* Bottom text on hero */}
              <div className="absolute bottom-4 start-5 end-5 text-white">
                <h2 className="text-xl font-extrabold leading-tight drop-shadow-lg">{venue.name}</h2>
                <div className="flex items-center gap-2 mt-1 text-white/80 text-sm">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                  <span>{venue.city}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" strokeWidth={1} />
                  <span className="text-white/50 text-xs">
                    {venue.pitches?.length ?? 0} {t('clubs.pitches')}
                  </span>
                </div>
              </div>
            </div>

            {/* ════ Content ════ */}
            <div className="relative -mt-3 bg-brand-bg rounded-t-3xl min-h-[50vh]">
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              {/* ── Club Info Card (Screenshot 2) ── */}
              <div className="relative mx-5 mt-2 bg-white rounded-2xl shadow-card p-5">
                <div className="space-y-3">
                  {/* P1-32: open/closed badge from the venue's operating hours
                      (Riyadh-local; same source of truth as the clubs list). */}
                  {(() => {
                    const openNow = isVenueOpenNow(venue);
                    return (
                      <span
                        role="status"
                        className={`absolute top-4 end-5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          openNow
                            ? 'text-green-700 bg-green-100'
                            : 'text-gray-500 bg-gray-100'
                        }`}
                      >
                        {openNow ? t('clubs.openNow') : t('clubs.closed')}
                      </span>
                    );
                  })()}

                  {/* Address — P2-map-pin (run #51): tappable maps deep-link.
                      The venues table carries no coordinates (schema.ts venues:
                      name/city/address only), so the link uses a free-form
                      maps query (name + address + city) — Google/Apple Maps
                      both resolve it; no coords = nothing to fake. The hero's
                      MapPin stays decorative (image caption, not an affordance). */}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${venue.name} ${venue.address} ${venue.city}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${venue.name} — ${t('clubs.openInMaps')}`}
                    className="flex items-center gap-3 group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0 group-active:bg-brand-green/20 transition-colors">
                      <MapPin className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">{t('clubs.address')}</p>
                      <p className="text-sm font-semibold text-brand-black truncate">{venue.address}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 rtl:-scale-x-100 flex-shrink-0" strokeWidth={2} />
                  </a>

                  {/* P1-32: operating hours row (Riyadh-local wall clock).
                      Rendered only when BOTH bounds exist — never invent
                      0:00 or 24:00 defaults for a missing half (post-cycle
                      review, run #19; `||` guard fixed run #20). */}
                  {venue.open_hour !== undefined && venue.close_hour !== undefined && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{t('clubs.hours')}</p>
                        <p className="text-sm font-semibold text-brand-black" dir="ltr">
                          {String(venue.open_hour ?? 0).padStart(2, '0')}:00 – {String(venue.close_hour ?? 24).padStart(2, '0')}:00
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Owner */}
                  {venue.owner && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{t('clubs.owner')}</p>
                        <p className="text-sm font-semibold text-brand-black">{venue.owner.full_name || venue.owner.handle}</p>
                      </div>
                    </div>
                  )}

                  {/* Amenities */}
                  {(() => {
                    const amenities = Array.isArray(venue.amenities) ? (venue.amenities as string[]) : [];
                    if (amenities.length === 0) return null;
                    return (
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Star className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400 mb-1.5">{t('clubs.amenities')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {amenities.map((code) => (
                              <span
                                key={code}
                                className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium"
                              >
                                {AMENITY_ICONS[code] || '✓'} {code.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── P1-32: Pitches (what you can actually book here) ── */}
              {(venue.pitches?.length ?? 0) > 0 && (
                <div className="mx-5 mt-4">
                  <p className="text-xs font-bold text-brand-green uppercase tracking-widest">
                    {t('clubs.availablePitches')}
                  </p>
                  <div className="mt-2 space-y-2">
                    {venue.pitches!.map((pitch) => (
                      <div
                        key={pitch.id}
                        className="bg-white rounded-2xl shadow-card p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-brand-black truncate">{pitch.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {pitch.size} · {pitch.surface_type}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-brand-green flex-shrink-0" dir="ltr">
                          {hourlyRateFormatter.format(Number(pitch.hourly_rate))}
                          <span className="block text-[10px] font-medium text-gray-400 text-end">
                            / {t('clubs.perHour')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── View Calendar + Selected Date ── */}
              <div className="mx-5 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest">
                      {t('clubs.availableMatches')}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-sm font-bold text-brand-black">
                        {/* P2-59 (run #50): hydration-stable now from useNow(); pre-mount falls through to the localized date */}
                        {selectedDate ? formatDateLabel(selectedDate, t, locale, clubNowMs) : t('clubs.allMatches')}
                      </span>
                      {selectedDate && (
                        <button
                          onClick={handleClearDate}
                          className="text-[11px] text-brand-green font-medium hover:underline"
                        >
                          {t('clubs.showAll')}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCalendar(true)}
                    className="flex items-center gap-1.5 bg-white rounded-full shadow-card px-4 py-2.5 text-sm font-semibold text-brand-black hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    <Calendar className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                    {t('clubs.viewCalendar')}
                  </button>
                </div>
              </div>

              {/* ── Available Matches (grouped by day, like Play) ── */}
              <div className="pt-4 pb-32">
                {matchesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 text-brand-green animate-spin" strokeWidth={2} />
                  </div>
                ) : matchesError ? (
                  /* ── Error state (P1-46, run #51) — what/why/next + retry.
                       Mirrors the venue-error block above; classified copy
                       (errors.*) instead of a false "no games" empty state. ── */
                  <div className="flex flex-col items-center justify-center py-12 px-8">
                    <AlertTriangle
                      className="w-8 h-8 text-brand-red mb-2"
                      strokeWidth={1.5}
                    />
                    <p className="text-sm text-gray-400 text-center">
                      {t(errorKey(classifyError(matchesError)))}
                    </p>
                    <button
                      onClick={() => void refetchMatches()}
                      className="mt-3 text-xs text-brand-green font-medium"
                    >
                      {t('common.retry')}
                    </button>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-8">
                    <Calendar className="w-8 h-8 text-gray-300 mb-2" strokeWidth={1.5} />
                    <p className="text-sm text-gray-400">
                      {selectedDate ? t('clubs.noMatches') : t('clubs.noMatchesAll')}
                    </p>
                    {selectedDate && (
                      <button
                        onClick={handleClearDate}
                        className="mt-2 text-xs text-brand-green font-medium"
                      >
                        {t('clubs.showAll')}
                      </button>
                    )}
                  </div>
                ) : (
                  <MatchDateSections
                    matches={matches}
                    currentUserId={currentUserId}
                    locale={locale === 'ar' ? 'ar' : 'en'}
                  />
                )}
              </div>

              {/* ── Host CTA ── */}
              <div className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-40">
                <Link
                  href={`/${locale}/host?venue=${venue.id}&venueName=${encodeURIComponent(venue.name)}${dateStr ? `&date=${dateStr}` : ''}`}
                  className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                    flex items-center justify-center gap-2
                    shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                    active:scale-[0.98] transition-transform inline-flex"
                >
                  {t('clubs.hostHere')}
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Calendar Bottom Sheet ── */}
      <BottomSheet open={showCalendar} onClose={() => setShowCalendar(false)} maxHeightClass="max-h-[80dvh]" widthClass="max-w-md">
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-brand-black">{t('clubs.selectDate')}</h2>
          <div className="flex items-center gap-2">
            {selectedDate && (
              <button
                onClick={handleClearDate}
                className="text-xs text-brand-green font-medium px-3 py-1.5 rounded-full bg-brand-green/10"
              >
                {t('clubs.showAll')}
              </button>
            )}
            <button
              onClick={() => setShowCalendar(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-8">
          <DatePicker onDateSelect={handleDateSelect} fireOnMount={false} selectedDate={selectedDate} />
        </div>
      </BottomSheet>

      <BottomNav />
    </MobileFrame>
  );
}
