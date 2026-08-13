'use client';

import {
    Calendar,
    Clock,
    Droplets,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface GameDetailsProps {
    date: string;
    time: string;
    price: number;
    hasJoined: boolean;
}

export default function GameDetails({ date, time, price, hasJoined }: GameDetailsProps) {
    const t = useTranslations('gameDetails');

    return (
        <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-base font-bold text-brand-black mb-4">{t('title')}</h3>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm text-gray-600">{t('date')}</span>
                    </div>
                    <span className="text-sm font-semibold text-brand-black">{date}, {time}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm text-gray-600">{t('price')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-brand-black">{price} SAR</span>
                        {hasJoined && (
                            <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                                {t('paid')}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Droplets className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm text-gray-600">{t('water')}</span>
                    </div>
                    <span className="text-sm font-semibold text-brand-black">{t('provided')}</span>
                </div>
            </div>
        </div>
    );
}
