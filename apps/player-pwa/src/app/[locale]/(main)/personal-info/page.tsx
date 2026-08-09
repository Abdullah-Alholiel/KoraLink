'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, User, Phone, MapPin, Award, Target, Loader2, AlertTriangle } from 'lucide-react';
import MobileFrame from '@/components/layout/MobileFrame';
import BottomNav from '@/components/layout/BottomNav';
import { useUserProfile, useUserStats } from '@/hooks/useUser';
import { selectUser, useAppStore } from '@/store/useAppStore';

export default function PersonalInfoPage() {
  const router = useRouter();
  const t = useTranslations();

  const storeUser = useAppStore(selectUser);
  const { data: apiUser, isLoading, error, refetch } = useUserProfile();
  const { data: stats } = useUserStats();

  const fullName = apiUser?.full_name ?? storeUser?.fullName ?? '-';
  const handle = apiUser?.handle ?? storeUser?.handle ?? '-';
  const phone = apiUser?.phone ?? storeUser?.phone ?? '-';
  const position = apiUser?.preferred_position ?? storeUser?.preferredPosition ?? t('common.empty');
  const skill = apiUser?.skill_level ?? storeUser?.skillLevel ?? '-';
  const location = apiUser?.preferred_location ?? storeUser?.preferredLocation ?? t('common.empty');

  const rows = [
    { icon: <User className="w-4 h-4" strokeWidth={1.5} />, label: t('completeProfile.fullName'), value: fullName },
    { icon: <User className="w-4 h-4" strokeWidth={1.5} />, label: t('completeProfile.handle'), value: handle },
    { icon: <Phone className="w-4 h-4" strokeWidth={1.5} />, label: t('profile.phoneNumber'), value: phone },
    { icon: <Target className="w-4 h-4" strokeWidth={1.5} />, label: t('completeProfile.preferredPosition'), value: position },
    { icon: <Award className="w-4 h-4" strokeWidth={1.5} />, label: t('completeProfile.skillLevel'), value: skill },
    { icon: <MapPin className="w-4 h-4" strokeWidth={1.5} />, label: t('completeProfile.preferredLocation'), value: location },
  ];

  return (
    <MobileFrame>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-3 flex-shrink-0 bg-white relative z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
          {t('profile.personalInfo')}
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
            <p className="text-sm text-gray-400 mt-3">{t('common.error')}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 bg-brand-green text-white px-6 py-2.5 rounded-full text-sm font-bold active:scale-95 transition-transform"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Populated */}
        {!isLoading && !error && (
          <div className="px-4 pt-4 pb-32">
            {/* Avatar */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-400">
                  {fullName.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Info rows */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              {rows.map((row, i) => (
                <div key={row.label}>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="text-gray-400 flex-shrink-0">{row.icon}</div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider w-28 flex-shrink-0">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold text-brand-black text-end flex-1" dir="ltr">
                      {row.value}
                    </span>
                  </div>
                  {i < rows.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
                </div>
              ))}
            </div>

            {/* Stats */}
            {stats && (
              <div className="flex justify-around bg-white rounded-2xl mt-4 py-4 shadow-card">
                <div className="text-center">
                  <p className="text-xl font-extrabold text-brand-black">{stats.games_played}</p>
                  <p className="text-xs text-gray-400">{t('profile.gamesPlayed')}</p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="text-center">
                  <p className="text-xl font-extrabold text-brand-black">{stats.karma_score}</p>
                  <p className="text-xs text-gray-400">{t('profile.karma')}</p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="text-center">
                  <p className="text-xl font-extrabold text-brand-black" dir="ltr">
                    {stats.rating?.toFixed(1) ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400">{t('profile.rating')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </MobileFrame>
  );
}
