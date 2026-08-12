'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  ArrowLeft,
  MapPin,
  Star,
  Calendar,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import { useVenue } from '@/hooks/useVenues';
import { useMatches } from '@/hooks/useMatches';
import MatchCard from '@/components/matches/MatchCard';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import DatePicker from '@/components/matches/DatePicker';

// ── Helpers ────────────────────────────────────────────────

function formatDateLabel(date: Date, t: (k: string) => string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return t('clubs.today');
  if (diff === 1) return t('clubs.tomorrow');
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
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

  const { data: venue, isLoading, error } = useVenue(id);

  // ── Date filter state ──────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  // Skip DatePicker's onDateSelect mount-fire — it would close the sheet instantly.
  const calendarJustOpened = useRef(false);
  useEffect(() => {
    if (showCalendar) calendarJustOpened.current = true;
  }, [showCalendar]);

  const dateStr = selectedDate.toISOString().slice(0, 10);

  // ── Fetch matches for this venue on selected date ────────
  const { data: matchesApi, isLoading: matchesLoading } = useMatches({
    date: dateStr,
    venue_id: id,
  });

  // useMatches already adapts + returns { matches: Match[] } — do NOT re-adapt
  const matches = matchesApi?.matches ?? [];

  const handleDateSelect = useCallback((date: Date) => {
    // DatePicker fires onDateSelect on mount — skip that initial fire so
    // the calendar sheet stays open for the user to actually choose a date.
    if (calendarJustOpened.current) {
      calendarJustOpened.current = false;
      return;
    }
    setSelectedDate(date);
    setShowCalendar(false);
  }, []);

  const handleGoToToday = useCallback(() => {
    setSelectedDate(new Date());
    setShowCalendar(false);
  }, []);

  // ── Scroll parallax ─────────────────────────────────────

  return (
    <MobileFrame>
      {/* ── Header ── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-safe pt-4 pb-3">
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
                  <span className="text-white text-sm font-semibold">{venue.rating?.toFixed(1)}</span>
                  <span className="text-white/50 text-xs ms-1">
                    · {venue.pitches?.length ?? 0} {t('clubs.pitches')}
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
              <div className="mx-5 mt-2 bg-white rounded-2xl shadow-card p-5">
                <div className="space-y-3">
                  {/* Address */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-brand-green" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">{t('clubs.address')}</p>
                      <p className="text-sm font-semibold text-brand-black truncate">{venue.address}</p>
                    </div>
                  </div>

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

              {/* ── View Calendar + Selected Date ── */}
              <div className="mx-5 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest">
                      {t('clubs.availableMatches')}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-sm font-bold text-brand-black">
                        {formatDateLabel(selectedDate, t)}
                      </span>
                      {!isToday(selectedDate) && (
                        <button
                          onClick={handleGoToToday}
                          className="text-[11px] text-brand-green font-medium hover:underline"
                        >
                          {t('clubs.backToToday')}
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

              {/* ── Available Matches ── */}
              <div className="px-5 pt-4 pb-32 space-y-3">
                {matchesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 text-brand-green animate-spin" strokeWidth={2} />
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Calendar className="w-8 h-8 text-gray-300 mb-2" strokeWidth={1.5} />
                    <p className="text-sm text-gray-400">{t('clubs.noMatches')}</p>
                    {!isToday(selectedDate) && (
                      <button
                        onClick={handleGoToToday}
                        className="mt-2 text-xs text-brand-green font-medium"
                      >
                        {t('clubs.backToToday')}
                      </button>
                    )}
                  </div>
                ) : (
                  matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))
                )}
              </div>

              {/* ── Host CTA ── */}
              <div className="fixed bottom-20 inset-x-0 max-w-md mx-auto px-5 z-40">
                <Link
                  href={`/${locale}/host?venue=${venue.id}&venueName=${encodeURIComponent(venue.name)}`}
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
      {showCalendar && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setShowCalendar(false)}
          />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-[70] animate-slide-up max-h-[75vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3">
              <h2 className="text-lg font-bold text-brand-black">{t('clubs.selectDate')}</h2>
              <div className="flex items-center gap-2">
                {!isToday(selectedDate) && (
                  <button
                    onClick={handleGoToToday}
                    className="text-xs text-brand-green font-medium px-3 py-1.5 rounded-full bg-brand-green/10"
                  >
                    {t('clubs.backToToday')}
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

            <div className="px-5 pb-8">
              <DatePicker onDateSelect={handleDateSelect} />
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </MobileFrame>
  );
}
