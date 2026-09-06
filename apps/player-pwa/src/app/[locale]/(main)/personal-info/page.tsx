'use client';

/**
 * Personal Information — view + edit the account profile.
 *
 * DESIGN (2026-09-06, r2 — Abdullah: "tailor personal information screen
 * design system and style same to profile screen"): now wears the Stadium
 * Night system from sketches/004 — standard white pinned header (back +
 * title + edit/save), the brand-green profile-hero gradient with the
 * identity block (avatar ring, name, handle, skill chip), and the SHARED
 * GlassStats bar (components/profile/GlassStats.tsx) so the stats read
 * pixel-identical to the Profile screen. Detail/edit sections stay flat:
 * hairline rows and underline-style fields (no boxes, no shadow cards).
 * The phone row stays visible (read-only) in edit mode: it is the OTP
 * identity and is not editable here.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, Loader2, Camera } from 'lucide-react';
import { useUserProfile, useUserStats, useUpdateProfile } from '@/hooks/useUser';
import { selectUser, useAppStore } from '@/store/useAppStore';
import { useAppStore as useStore } from '@/store/useAppStore';
import AppBar from '@/components/layout/AppBar';
import GlassStats from '@/components/profile/GlassStats';
import FlatSectionLabel from '@/components/profile/FlatSectionLabel';

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

  const displayName = apiUser?.full_name ?? storeUser?.fullName ?? '';
  const displayHandle = apiUser?.handle ?? storeUser?.handle ?? '';
  const displaySkill = apiUser?.skill_level ?? storeUser?.skillLevel ?? '';
  const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
  const phone = apiUser?.phone ?? storeUser?.phone ?? '-';
  const pomCount = apiUser?.pom_count ?? 0;
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <div>
      {/* Header — standard pinned white bar (Play-screen shadow language) */}
      <div className="sticky top-0 z-40 flex items-center bg-white px-4 pt-[var(--top-safe-inset)] pb-2 shadow-[0_4px_14px_rgba(0,0,0,0.07)] border-b border-gray-100">
        <button
          onClick={() => (editing ? setEditing(false) : router.back())}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-50"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
        </button>
        <h1 className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 text-base font-bold text-brand-black">
          {t('profile.personalInfo')}
        </h1>
        {!editing ? (
          <button
            onClick={startEdit}
            className="absolute end-4 text-sm font-bold text-brand-green active:scale-95 transition-transform"
          >
            {t('common.edit')}
          </button>
        ) : (
          <div className="absolute end-4 flex items-center gap-4">
            <button
              onClick={() => setEditing(false)}
              className="text-sm font-medium text-gray-400 active:scale-95 transition-transform"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={updateProfile.isPending}
              className="text-sm font-bold text-brand-green disabled:opacity-50 active:scale-95 transition-transform"
            >
              {updateProfile.isPending ? t('profile.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-green" strokeWidth={2} />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-col items-center px-8 py-20">
          <p className="text-sm text-gray-400">{t('common.error')}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 text-sm font-bold text-brand-green active:scale-95 transition-transform"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* ── Populated ── */}
      {!isLoading && !error && (
        <div className="pb-32">
          {/* ─── Identity hero — Stadium Night system (same as Profile) ─── */}
          <div className="relative overflow-hidden bg-profile-hero text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(340px 260px at 85% -40px, rgba(255,255,255,0.10), transparent 70%), radial-gradient(280px 220px at 8% 30%, rgba(255,255,255,0.06), transparent 70%)',
              }}
            />
            <div className="relative px-6 pb-7">
              <AppBar light />

              <div className="mt-4 flex flex-col items-center">
                <div className="relative">
                  <div className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-brand-green-deep/60">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-white/90">{avatarInitial}</span>
                    )}
                  </div>
                  {!editing && (
                    <button
                      onClick={startEdit}
                      className="absolute bottom-0 end-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-green shadow-md active:scale-95 transition-transform"
                      aria-label={t('common.edit')}
                    >
                      <Camera className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
                <h2 className="mt-3 truncate text-[21px] font-bold leading-tight">{displayName}</h2>
                <p className="mt-0.5 text-[13px] text-white/60" dir="ltr">@{displayHandle}</p>
                {!editing && displaySkill && displaySkill !== '-' && (
                  <span
                    className="mt-2.5 inline-block rounded-full bg-white px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-green"
                    data-testid="skill-line"
                  >
                    {displaySkill}
                  </span>
                )}
              </div>

              {/* Shared glass stats — identical component to the Profile screen */}
              <div className="mt-6" data-testid="stats-row">
                <GlassStats
                  games={stats?.games_played ?? 0}
                  potm={pomCount}
                  karma={stats?.karma_score ?? 0}
                />
              </div>
            </div>
          </div>

          {/* ─── Details / Edit form — flat, hairline language ─── */}
          {!editing ? (
            <dl className="mx-6 mt-2">
              <DetailRow label={t('profile.phoneNumber')} value={phone} ltr />
              <DetailRow label={t('completeProfile.preferredPosition')} value={apiUser?.preferred_position ?? storeUser?.preferredPosition ?? t('common.empty')} />
              <DetailRow label={t('completeProfile.preferredLocation')} value={apiUser?.preferred_location ?? storeUser?.preferredLocation ?? t('common.empty')} />
            </dl>
          ) : (
            <div className="mx-6 mt-2">
              <FlatSectionLabel label={t('profile.sectionDetails')} />
              <p className="py-3.5 text-sm font-semibold text-brand-black" dir="ltr">
                <span className="me-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 rtl:me-0 rtl:ms-3">
                  {t('profile.phoneNumber')}
                </span>
                {phone}
              </p>
              <div className="space-y-5 border-t border-gray-100 pt-5">
                <EditField label={t('completeProfile.fullName')} value={fullName} onChange={setFullName} />
                <EditField label={t('completeProfile.handle')} value={handle} onChange={setHandle} prefix="@" />
                <EditSelect label={t('completeProfile.preferredPosition')} value={position} onChange={setPosition} options={POSITIONS as unknown as string[]} />
                <EditSelect label={t('completeProfile.skillLevel')} value={skill} onChange={setSkill} options={SKILL_LEVELS as unknown as string[]} />
                <EditField label={t('completeProfile.preferredLocation')} value={location} onChange={setLocation} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pieces ─── */

/** Editorial detail row — tiny tracked label, bold value, hairline divider. */
function DetailRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-100 py-3.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-brand-black" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

/** Underline-style edit field — no box, hairline that turns green on focus. */
function EditField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
        {label}
      </label>
      <div className="flex items-center gap-1 border-b border-gray-200 py-2 transition-colors focus-within:border-brand-green">
        {prefix && <span className="text-sm font-semibold text-gray-400">{prefix}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm font-semibold text-brand-black outline-none"
        />
      </div>
    </div>
  );
}

/** Underline-style select — same hairline language, chevron as affordance. */
function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
        {label}
      </label>
      <div className="relative border-b border-gray-200 py-2 transition-colors focus-within:border-brand-green">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-transparent pe-6 text-sm font-semibold text-brand-black outline-none"
        >
          <option value="">{`— ${label} —`}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}
