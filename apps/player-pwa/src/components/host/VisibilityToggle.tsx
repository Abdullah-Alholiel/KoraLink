'use client';

import { useTranslations } from 'next-intl';
import { Globe, Lock } from 'lucide-react';

export type Visibility = 'public' | 'private';

export interface VisibilityToggleProps {
    value: Visibility;
    onChange: (v: Visibility) => void;
}

/**
 * Public/Private match visibility selector (US1).
 * Pill-toggle per koralink-ui-standards §4 — identical pattern in both
 * booking modes ("via KoraLink" and "by yourself").
 */
export default function VisibilityToggle({ value, onChange }: VisibilityToggleProps) {
    const t = useTranslations('host');

    const options: { key: Visibility; icon: typeof Globe; label: string; desc: string }[] = [
        { key: 'public', icon: Globe, label: t('visibilityPublic'), desc: t('visibilityPublicDesc') },
        { key: 'private', icon: Lock, label: t('visibilityPrivate'), desc: t('visibilityPrivateDesc') },
    ];

    return (
        <div className="px-5 pt-4">
            <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                {t('visibility')}
            </p>
            <div className="flex rounded-full border border-gray-200 overflow-hidden" role="group" aria-label={t('visibility')}>
                {options.map(({ key, icon: Icon, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        aria-pressed={value === key}
                        className={`flex-1 py-2.5 px-3 text-xs font-semibold text-center transition-all inline-flex items-center justify-center gap-1.5 active:scale-95 ${
                            value === key
                                ? 'bg-brand-green text-white'
                                : 'bg-white text-gray-500'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                        {label}
                    </button>
                ))}
            </div>
            {/* Active option description */}
            <p className="text-xs text-gray-400 mt-2 px-1">
                {value === 'public' ? t('visibilityPublicDesc') : t('visibilityPrivateDesc')}
            </p>
        </div>
    );
}
