'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  MapPin,
  Star,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useVenue } from '@/hooks/useVenues';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';

export default function ClubPage() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const t = useTranslations();

  const { data: venue, isLoading, error } = useVenue(id);

  return (
    <MobileFrame>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-3 flex-shrink-0 bg-white relative z-10">
        <Link
          href={`/${locale}/clubs`}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
        </Link>
        <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
          {isLoading ? '' : venue?.name ?? 'Venue'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-col items-center py-20 px-8">
            <AlertTriangle className="w-10 h-10 text-brand-red" strokeWidth={1.5} />
            <p className="text-sm text-gray-400 mt-3">{t('clubs.error')}</p>
          </div>
        )}

        {/* Venue Info */}
        {venue && (
          <>
            {/* Hero */}
            <div className="bg-gradient-to-b from-brand-green to-brand-black h-48 relative">
              <div className="absolute bottom-4 start-5 text-white">
                <h2 className="text-xl font-bold">{venue.name}</h2>
                <div className="flex items-center gap-2 mt-1 text-white/70 text-sm">
                  <MapPin className="w-4 h-4" strokeWidth={1.5} />
                  <span>{venue.city}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" strokeWidth={1} />
                  <span className="text-white text-sm font-semibold">{venue.rating?.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="bg-white mx-4 rounded-2xl shadow-card p-4 -mt-4 relative z-10">
              <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-2">
                {t('clubs.address')}
              </p>
              <p className="text-sm text-gray-600">{venue.address}</p>
            </div>

            {/* Pitches */}
            {venue.pitches && venue.pitches.length > 0 && (
              <div className="px-5 pt-6 pb-4">
                <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                  {t('clubs.availablePitches')}
                </p>
                <div className="space-y-3">
                  {venue.pitches.map((pitch) => (
                    <div
                      key={pitch.id}
                      className="bg-white rounded-2xl shadow-card p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-brand-black">{pitch.name}</p>
                        <p className="text-xs text-gray-400">
                          {pitch.surface_type} &bull; {pitch.size} &bull; {pitch.environment}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-lg font-extrabold text-brand-black">
                          SAR {pitch.hourly_rate}
                        </p>
                        <p className="text-[10px] text-gray-400">per hour</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Host CTA */}
            <div className="px-5 pt-2 pb-32">
              <Link
                href={`/${locale}/host`}
                className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                  flex items-center justify-center gap-2
                  shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                  active:scale-[0.98] transition-transform inline-flex"
              >
                Host a Match Here
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </MobileFrame>
  );
}
