'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    const router = useRouter();
    const t = useTranslations('legal');

    return (
        <div className="min-h-screen bg-brand-bg">
            <div className="flex items-center px-4 pt-4 pb-3 flex-shrink-0 bg-white">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    {t('termsTitle')}
                </h1>
            </div>
            <div className="p-6 prose prose-sm max-w-none text-gray-600">
                <p className="text-sm text-gray-500 mb-4">{t('lastUpdated')}: August 2026</p>
                <p className="text-sm leading-relaxed mb-4">{t('termsIntro')}</p>
                <h2 className="text-base font-bold text-brand-black mt-6 mb-2">{t('termsAccounts')}</h2>
                <p className="text-sm leading-relaxed">{t('termsAccountsDesc')}</p>
                <h2 className="text-base font-bold text-brand-black mt-6 mb-2">{t('termsMatches')}</h2>
                <p className="text-sm leading-relaxed">{t('termsMatchesDesc')}</p>
                <h2 className="text-base font-bold text-brand-black mt-6 mb-2">{t('termsPayments')}</h2>
                <p className="text-sm leading-relaxed">{t('termsPaymentsDesc')}</p>
                <h2 className="text-base font-bold text-brand-black mt-6 mb-2">{t('privacyContact')}</h2>
                <p className="text-sm leading-relaxed">hello@koralink.sa</p>
            </div>
        </div>
    );
}
