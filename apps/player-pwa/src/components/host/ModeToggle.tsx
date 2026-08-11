'use client';

import { useTranslations } from 'next-intl';

export interface ModeToggleProps {
    mode: 'koralink' | 'self';
    onModeChange: (mode: 'koralink' | 'self') => void;
}

export default function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
    const t = useTranslations();

    return (
        <div className="flex px-4 pt-4 pb-3">
            <div className="flex rounded-full border border-gray-200 overflow-hidden bg-gray-50 p-0.5 w-full">
                <button
                    onClick={() => onModeChange('koralink')}
                    className={`flex-1 py-2.5 text-sm font-semibold text-center rounded-full transition-all ${
                        mode === 'koralink'
                            ? 'bg-brand-green text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {t('host.bookViaUs')}
                </button>
                <button
                    onClick={() => onModeChange('self')}
                    className={`flex-1 py-2.5 text-sm font-semibold text-center rounded-full transition-all ${
                        mode === 'self'
                            ? 'bg-brand-green text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {t('host.bookYourself')}
                </button>
            </div>
        </div>
    );
}
