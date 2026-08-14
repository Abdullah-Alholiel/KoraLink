'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    MapPin,
    Trophy,
    ChevronDown,
    Loader2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCompleteProfile } from '@/hooks/useAuth';
import type { SkillLevel } from '@/types';

export default function CompleteProfilePage() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations('completeProfile');

    const [fullName, setFullName] = useState('');
    const [location, setLocation] = useState('');
    const [position, setPosition] = useState('');
    const [skillLevel, setSkillLevel] = useState<SkillLevel>('Intermediate');
    const [error, setError] = useState<string | null>(null);

    const completeProfile = useCompleteProfile();

    const skillLevels: { value: SkillLevel; label: string }[] = [
        { value: 'Beginner', label: t('skills.beginner') },
        { value: 'Intermediate', label: t('skills.intermediate') },
        { value: 'Advanced', label: t('skills.advanced') },
    ];

    const handleFinish = () => {
        if (!fullName.trim()) return;
        setError(null);
        completeProfile.mutate(
            {
                fullName: fullName.trim(),
                preferredLocation: location || undefined,
                preferredPosition: position || undefined,
                skillLevel,
            },
            {
                onSuccess: () => router.push(`/${locale}/play`),
                onError: (err) => setError(err.message),
            },
        );
    };

    return (
        <div className="flex flex-col min-h-full">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 pt-[var(--top-safe-inset)] pb-2">
                <button
                    onClick={() => router.back()}
                    className="w-10 h-10 flex items-center justify-center"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
            </div>

            {/* ── Content ───────────────────────────── */}
            <div className="flex-1 px-6 pb-24">
                <h1 className="text-2xl font-bold text-brand-black mt-2">
                    {t('title')}
                </h1>
                <p className="text-sm text-gray-400 mt-1.5">
                    {t('subtitle')}
                </p>

                {/* Avatar */}
                <div className="flex justify-center mt-6">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-3xl text-gray-300">👤</span>
                        </div>
                        <button className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-brand-black flex items-center justify-center border-2 border-white"
                            onClick={() => router.push(`/${locale}/personal-info`)}>
                            <Camera className="w-4 h-4 text-white" strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {/* Full Name */}
                <div className="mt-6">
                    <label className="text-sm font-semibold text-brand-black">{t('fullName')}</label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-brand-green transition-colors">
                        <span className="text-gray-400">👤</span>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t('fullNamePlaceholder')}
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                            disabled={completeProfile.isPending}
                        />
                    </div>
                </div>

                {/* Preferred Location */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        {t('preferredLocation')}
                    </label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-brand-green transition-colors">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder={t('locationPlaceholder')}
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                            disabled={completeProfile.isPending}
                        />
                    </div>
                </div>

                {/* Preferred Position */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        {t('preferredPosition')}{' '}
                        <span className="text-gray-400 font-normal"></span>
                    </label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3">
                        <Trophy className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                        <select
                            value={position}
                            onChange={(e) => setPosition(e.target.value)}
                            className="flex-1 text-sm text-brand-black outline-none bg-transparent appearance-none"
                            disabled={completeProfile.isPending}
                        >
                            <option value="">{t('selectPosition')}</option>
                            <option value="goalkeeper">{t('positions.goalkeeper')}</option>
                            <option value="defender">{t('positions.defender')}</option>
                            <option value="midfielder">{t('positions.midfielder')}</option>
                            <option value="forward">{t('positions.forward')}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Skill Level */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        {t('skillLevel')}
                    </label>
                    <div className="flex gap-2 mt-2">
                        {skillLevels.map((level) => (
                            <button
                                key={level.value}
                                onClick={() => setSkillLevel(level.value)}
                                disabled={completeProfile.isPending}
                                className={`
                  px-4 py-2.5 rounded-full text-sm font-medium transition-all
                  ${skillLevel === level.value
                                        ? 'bg-brand-green text-white'
                                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                    }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                            >
                                {level.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Bottom Section ────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 pb-safe bg-white">
                {/* Error */}
                {error && (
                    <p className="text-center text-sm text-brand-red mb-3">{error}</p>
                )}

                <button
                    onClick={handleFinish}
                    disabled={completeProfile.isPending || !fullName.trim()}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${!completeProfile.isPending && fullName.trim()
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    {completeProfile.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('saving')}
                        </>
                    ) : (
                        <>
                            {t('save')}
                            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
