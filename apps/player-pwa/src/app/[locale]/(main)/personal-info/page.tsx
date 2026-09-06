'use client';

/**
 * Personal Information — view + edit the account profile.
 *
 * DESIGN (2026-09-06, Abdullah: "less AI slop, minimal"): typography-led,
 * matching the redesigned host onboarding. No gradient banners, no icon
 * chips, no pill badges, no shadow cards — flat identity block, a
 * hairline-divided stats row, an editorial detail list, and underline-style
 * edit fields. The phone row stays visible (read-only) in edit mode: it is
 * the OTP identity and is not editable here.
 *
 * Edit affordances: "Edit" in the header becomes Cancel / Save (text
 * buttons — typographic, not icon circles).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
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

  const displayName = apiUser?.full_name ?? storeUser?.fullName ?? '';
  const displayHandle = apiUser?.handle ?? storeUser?.handle ?? '';
  const displaySkill = apiUser?.skill_level ?? storeUser?.skillLevel ?? '';
  const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
  const phone = apiUser?.phone ?? storeUser?.phone ?? '-';
  const pomCount = apiUser?.pom_count ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-3 bg-brand-bg sticky top-0 z-10">
        <button
          onClick={() => (editing ? setEditing(false) : router.back())}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-5 h-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-brand-black absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
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
          <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-col items-center py-20 px-8">
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
          {/* ─── Identity — flat, typographic ─── */}
          <div className="flex flex-col items-center pt-6 pb-7">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden ring-1 ring-gray-200">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-gray-400">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h2 className="mt-4 text-[22px] font-bold leading-tight text-brand-black">
              {displayName}
            </h2>
            <p className="mt-0.5 text-sm text-gray-400" dir="ltr">@{displayHandle}</p>
            {!editing && displaySkill && displaySkill !== '-' && (
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-green" data-testid="skill-line">
                {displaySkill}
              </p>
            )}
          </div>

          {/* ─── Stats — hairline-divided flat row ─── */}
          <div className="mx-6 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-4 rtl:divide-x-reverse" data-testid="stats-row">
            {[
              { value: stats?.games_played ?? 0, label: t('profile.gamesPlayed') },
              { value: pomCount, label: t('profile.pomCount') },
              { value: stats?.karma_score ?? 0, label: t('profile.karma') },
            ].map((stat) => (
              <div key={stat.label} className="px-2 text-center">
                <p className="text-xl font-extrabold text-brand-black tabular-nums" dir="ltr">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* ─── Details / Edit form ─── */}
          {!editing ? (
            <dl className="mx-6 mt-2">
              <DetailRow label={t('profile.phoneNumber')} value={phone} ltr />
              <DetailRow label={t('completeProfile.preferredPosition')} value={apiUser?.preferred_position ?? storeUser?.preferredPosition ?? t('common.empty')} />
              <DetailRow label={t('completeProfile.preferredLocation')} value={apiUser?.preferred_location ?? storeUser?.preferredLocation ?? t('common.empty')} />
            </dl>
          ) : (
            <div className="mx-6 mt-2">
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
