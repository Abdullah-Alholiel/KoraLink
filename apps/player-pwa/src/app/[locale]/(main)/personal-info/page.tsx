'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
    ArrowLeft,
    User,
    Phone,
    MapPin,
    Award,
    Target,
    Loader2,
    AlertTriangle,
    Trophy,
    Star,
    Sparkles,
    Shield,
} from 'lucide-react';
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
  const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
  const pomCount = apiUser?.pom_count ?? 0;

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
        <h1 className="text-base font-bold text-brand-black absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
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

        {/* ── Populated ── */}
        {!isLoading && !error && (
          <div className="px-4 pt-5 pb-32">
            {/* ─── Profile Hero Card ─── */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
                {/* Gradient header strip */}
                <div className="h-20 bg-gradient-to-r from-brand-green to-brand-green-light relative">
                    <div className="absolute inset-0 flex items-end justify-center">
                        <Sparkles className="w-16 h-16 text-white/10" strokeWidth={1.5} />
                    </div>
                </div>
                {/* Avatar + name */}
                <div className="px-5 pb-5 -mt-10 flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-gray-200 border-4 border-white flex items-center justify-center overflow-hidden shadow-sm">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-2xl font-bold text-gray-400">
                                {fullName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <h2 className="text-lg font-bold text-brand-black mt-2">{fullName}</h2>
                    <p className="text-xs text-gray-400" dir="ltr">{handle}</p>

                    {/* Skill badge */}
                    {skill && skill !== '-' && (
                        <span className="mt-2 text-[10px] font-bold text-brand-green bg-brand-green/10 px-3 py-1 rounded-full uppercase tracking-wide flex items-center gap-1">
                            <Shield className="w-3 h-3" strokeWidth={2.5} />
                            {skill}
                        </span>
                    )}
                </div>
            </div>

            {/* ─── Stats Row ─── */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard
                    icon={<Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />}
                    value={stats?.games_played ?? 0}
                    label={t('profile.gamesPlayed')}
                />
                <StatCard
                    icon={<Star className="w-4 h-4 text-amber-500 fill-amber-500" strokeWidth={2} />}
                    value={pomCount}
                    label={t('profile.pomCount')}
                    highlight
                />
                <StatCard
                    icon={<Award className="w-4 h-4 text-gray-400" strokeWidth={2} />}
                    value={stats?.rating?.toFixed(1) ?? '—'}
                    label={t('profile.rating')}
                />
            </div>

            {/* ─── Info Sections ─── */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
                <InfoRow
                    icon={<Phone className="w-4 h-4" strokeWidth={1.5} />}
                    label={t('profile.phoneNumber')}
                    value={phone}
                    ltr
                />
                <div className="h-px bg-gray-50 mx-4" />
                <InfoRow
                    icon={<Target className="w-4 h-4" strokeWidth={1.5} />}
                    label={t('completeProfile.preferredPosition')}
                    value={position}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <InfoRow
                    icon={<MapPin className="w-4 h-4" strokeWidth={1.5} />}
                    label={t('completeProfile.preferredLocation')}
                    value={location}
                />
            </div>

            {/* ─── Karma Card ─── */}
            <div className="bg-gradient-to-br from-brand-green to-brand-green-light rounded-2xl shadow-card p-5 mb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
                            {t('profile.karma')}
                        </p>
                        <p className="text-3xl font-extrabold text-white mt-1" dir="ltr">
                            {stats?.karma_score ?? 0}
                        </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
                    </div>
                </div>
            </div>

            {/* ─── Account Info ─── */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest px-5 pt-4 pb-2">
                    {t('profile.about')}
                </p>
                <InfoRow
                    icon={<User className="w-4 h-4" strokeWidth={1.5} />}
                    label={t('completeProfile.fullName')}
                    value={fullName}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <InfoRow
                    icon={<span className="text-[10px] font-bold text-gray-400">@</span>}
                    label={t('completeProfile.handle')}
                    value={handle}
                    ltr
                />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </MobileFrame>
  );
}

/* ─── Reusable Sub-Components ─── */

function StatCard({ icon, value, label, highlight }: { icon: React.ReactNode; value: string | number; label: string; highlight?: boolean }) {
    return (
        <div className={`rounded-2xl shadow-card p-3 text-center ${highlight ? 'bg-white border border-brand-green/20' : 'bg-white'}`}>
            <div className="flex items-center justify-center mb-1">
                {icon}
            </div>
            <p className="text-xl font-extrabold text-brand-black" dir="ltr">{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
        </div>
    );
}

function InfoRow({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="text-gray-400 flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {icon}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0" style={{ minWidth: '90px' }}>
                {label}
            </span>
            <span className={`text-sm font-semibold text-brand-black flex-1 text-end ${ltr ? '' : ''}`} dir={ltr ? 'ltr' : undefined}>
                {value}
            </span>
        </div>
    );
}
