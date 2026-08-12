'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
    ArrowLeft,
    Phone,
    MapPin,
    Target,
    Loader2,
    AlertTriangle,
    Trophy,
    Star,
    Sparkles,
    Shield,
    Check,
    X,
    ChevronDown,
} from 'lucide-react';
import { useUserProfile, useUserStats, useUpdateProfile } from '@/hooks/useUser';
import { selectUser, useAppStore } from '@/store/useAppStore';
import { useAppStore as useStore } from '@/store/useAppStore';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] as const;

export default function PersonalInfoPage() {
  const router = useRouter();
  const t = useTranslations();

  const storeUser = useAppStore(selectUser);
  const { data: apiUser, isLoading, error, refetch } = useUserProfile();
  const { data: stats } = useUserStats();
  const updateProfile = useUpdateProfile();
  const showToast = useStore((s) => s.showToast);

  // ── Edit state ──
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [handle, setHandle] = useState('');
  const [position, setPosition] = useState('');
  const [skill, setSkill] = useState('');
  const [location, setLocation] = useState('');

  const startEdit = () => {
    setFullName(apiUser?.full_name ?? storeUser?.fullName ?? '');
    setHandle(apiUser?.handle ?? storeUser?.handle ?? '');
    setPosition(apiUser?.preferred_position ?? storeUser?.preferredPosition ?? '');
    setSkill(apiUser?.skill_level ?? storeUser?.skillLevel ?? '');
    setLocation(apiUser?.preferred_location ?? storeUser?.preferredLocation ?? '');
    setEditing(true);
  };

  const handleSave = () => {
    updateProfile.mutate(
      {
        full_name: fullName,
        handle,
        preferred_position: position || undefined,
        preferred_location: location || undefined,
        skill_level: (skill as 'Beginner' | 'Intermediate' | 'Advanced') || undefined,
      },
      {
        onSuccess: () => {
          setEditing(false);
          showToast(t('profile.profileUpdated'), 'success');
        },
        onError: () => {
          showToast(t('common.error'), 'error');
        },
      },
    );
  };

  const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
  const pomCount = apiUser?.pom_count ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-3 bg-white sticky top-0 z-10">
        <button
          onClick={() => editing ? setEditing(false) : router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-brand-black absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
          {t('profile.personalInfo')}
        </h1>
        {/* Edit / Save button */}
        {!editing ? (
          <button
            onClick={startEdit}
            className="absolute end-4 text-sm font-bold text-brand-green active:scale-95 transition-transform"
          >
            {t('common.edit')}
          </button>
        ) : (
          <div className="absolute end-4 flex items-center gap-2">
            <button
              onClick={() => setEditing(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:scale-95 transition-transform"
            >
              <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
            </button>
            <button
              onClick={handleSave}
              disabled={updateProfile.isPending}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-brand-green active:scale-95 transition-transform disabled:opacity-50"
            >
              {updateProfile.isPending ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" strokeWidth={2} />
              ) : (
                <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}
      </div>

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
              <div className="h-20 bg-gradient-to-r from-brand-green to-brand-green-light relative">
                  <div className="absolute inset-0 flex items-end justify-center">
                      <Sparkles className="w-16 h-16 text-white/10" strokeWidth={1.5} />
                  </div>
              </div>
              <div className="px-5 pb-5 -mt-10 flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-gray-200 border-4 border-white flex items-center justify-center overflow-hidden shadow-sm">
                      {avatarUrl ? (
                          <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                      ) : (
                          <span className="text-2xl font-bold text-gray-400">
                              {(apiUser?.full_name ?? storeUser?.fullName ?? '?').charAt(0).toUpperCase()}
                          </span>
                      )}
                  </div>
                  <h2 className="text-lg font-bold text-brand-black mt-2">
                    {apiUser?.full_name ?? storeUser?.fullName}
                  </h2>
                  <p className="text-xs text-gray-400" dir="ltr">@{apiUser?.handle ?? storeUser?.handle}</p>

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
                  icon={<Sparkles className="w-4 h-4 text-amber-500" strokeWidth={2} />}
                  value={stats?.karma_score ?? 0}
                  label={t('profile.karma')}
                  highlight
              />
          </div>

          {/* ─── Editable Info Sections ─── */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
              {!editing ? (
                <>
                  <InfoRow icon={<Phone className="w-4 h-4" strokeWidth={1.5} />} label={t('profile.phoneNumber')} value={apiUser?.phone ?? storeUser?.phone ?? '-'} ltr />
                  <div className="h-px bg-gray-50 mx-4" />
                  <InfoRow icon={<Target className="w-4 h-4" strokeWidth={1.5} />} label={t('completeProfile.preferredPosition')} value={apiUser?.preferred_position ?? storeUser?.preferredPosition ?? t('common.empty')} />
                  <div className="h-px bg-gray-50 mx-4" />
                  <InfoRow icon={<MapPin className="w-4 h-4" strokeWidth={1.5} />} label={t('completeProfile.preferredLocation')} value={apiUser?.preferred_location ?? storeUser?.preferredLocation ?? t('common.empty')} />
                </>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  <EditField label={t('completeProfile.fullName')} value={fullName} onChange={setFullName} />
                  <EditField label={t('completeProfile.handle')} value={handle} onChange={setHandle} prefix="@" />
                  <EditSelect label={t('completeProfile.preferredPosition')} value={position} onChange={setPosition} options={POSITIONS as unknown as string[]} />
                  <EditSelect label={t('completeProfile.skillLevel')} value={skill} onChange={setSkill} options={SKILL_LEVELS as unknown as string[]} />
                  <EditField label={t('completeProfile.preferredLocation')} value={location} onChange={setLocation} />
                </div>
              )}
          </div>

          {/* ─── Karma Card ─── */}
          <div className="bg-gradient-to-br from-brand-green to-brand-green-light rounded-2xl shadow-card p-5 mb-4">
              <div className="flex items-center justify-between">
                  <div>
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{t('profile.karma')}</p>
                      <p className="text-3xl font-extrabold text-white mt-1" dir="ltr">{stats?.karma_score ?? 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
                  </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable Sub-Components ─── */

function StatCard({ icon, value, label, highlight }: { icon: React.ReactNode; value: string | number; label: string; highlight?: boolean }) {
    return (
        <div className={`rounded-2xl shadow-card p-3 text-center ${highlight ? 'bg-white border border-brand-green/20' : 'bg-white'}`}>
            <div className="flex items-center justify-center mb-1">{icon}</div>
            <p className="text-xl font-extrabold text-brand-black" dir="ltr">{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
        </div>
    );
}

function InfoRow({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="text-gray-400 flex-shrink-0 w-4 h-4 flex items-center justify-center">{icon}</div>
            <span className="text-xs text-gray-400 flex-shrink-0" style={{ minWidth: '90px' }}>{label}</span>
            <span className="text-sm font-semibold text-brand-black flex-1 text-end" dir={ltr ? 'ltr' : undefined}>{value}</span>
        </div>
    );
}

function EditField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
    return (
        <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">{label}</label>
            <div className="flex items-center gap-1 bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 focus-within:border-brand-green transition-colors">
                {prefix && <span className="text-sm font-medium text-gray-400">{prefix}</span>}
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 text-sm font-semibold text-brand-black outline-none bg-transparent"
                />
            </div>
        </div>
    );
}

function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
    return (
        <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">{label}</label>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full appearance-none bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-semibold text-brand-black outline-none focus:border-brand-green transition-colors"
                >
                    <option value="">{`— ${label} —`}</option>
                    {options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
        </div>
    );
}
