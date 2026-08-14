'use client';

import {
    Calendar,
    Clock,
    Droplets,
    Crown,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface GameDetailsProps {
    date: string;
    time: string;
    price: number;
    hasJoined: boolean;
    isHost?: boolean;
}

export default function GameDetails({ date, time, price, hasJoined, isHost }: GameDetailsProps) {
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
                        {isHost ? (
                            <>
                                <span className="text-sm font-bold text-brand-green">{t('hostFree')}</span>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Crown className="w-3 h-3 text-amber-600 fill-amber-500" />
                                    {t('hostBadge')}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="text-sm font-semibold text-brand-black">
                                    {price === 0 ? t('free') : `${price} SAR`}
                                </span>
                                {hasJoined && (
                                    <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                                        {t('paid')}
                                    </span>
                                )}
                            </>
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
