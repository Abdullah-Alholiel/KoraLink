'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

// Run #205 (launch lane F4): expanded Terms of Service (13 sections), rendered
// from the `legal` namespace as a section array — same contract as the privacy
// page. Content is a DRAFT pending lawyer review (draftBanner surfaces this).
type LegalSection = { heading: string; paragraphs: string[] };

const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'termsAccountsH',
    paragraphs: [
      'termsAccountsBody1',
      'termsAccountsBody2',
      'termsAccountsBody3',
      'termsAccountsBody4',
    ],
  },
  {
    heading: 'termsMatchesH',
    paragraphs: [
      'termsMatchesBody1',
      'termsMatchesBody2',
      'termsMatchesBody3',
      'termsMatchesBody4',
    ],
  },
  {
    heading: 'termsHostingTitle',
    paragraphs: ['termsHostingDesc'],
  },
  {
    heading: 'termsHostingPayoutTitle',
    paragraphs: ['termsHostingPayoutDesc'],
  },
  {
    heading: 'termsPaymentsH',
    paragraphs: [
      'termsPaymentsBody1',
      'termsPaymentsBody2',
      'termsPaymentsBody3',
      'termsPaymentsBody4',
    ],
  },
  {
    heading: 'termsRefundH',
    paragraphs: [
      'termsRefundBody1',
      'termsRefundBody2',
      'termsRefundBody3',
      'termsRefundBody4',
    ],
  },
  {
    heading: 'termsConductH',
    paragraphs: [
      'termsConductBody1',
      'termsConductBody2',
      'termsConductBody3',
      'termsConductBody4',
    ],
  },
  {
    heading: 'termsSuspensionH',
    paragraphs: [
      'termsSuspensionBody1',
      'termsSuspensionBody2',
      'termsSuspensionBody3',
    ],
  },
  {
    heading: 'termsIpH',
    paragraphs: [
      'termsIpBody1',
      'termsIpBody2',
      'termsIpBody3',
    ],
  },
  {
    heading: 'termsLiabilityH',
    paragraphs: [
      'termsLiabilityBody1',
      'termsLiabilityBody2',
      'termsLiabilityBody3',
    ],
  },
  {
    heading: 'termsLawH',
    paragraphs: [
      'termsLawBody1',
      'termsLawBody2',
    ],
  },
  {
    heading: 'termsChangesH',
    paragraphs: ['termsChangesBody1'],
  },
  {
    heading: 'termsContactH',
    paragraphs: ['termsContactBody1'],
  },
];

export default function TermsPage() {
    const router = useRouter();
    const t = useTranslations('legal');

    return (
        <div className="min-h-dvh bg-brand-bg">
            <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-3 flex-shrink-0 bg-white">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    {t('termsTitle')}
                </h1>
            </div>
            <div className="p-6 max-w-none text-gray-600">
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-800">{t('draftBanner')}</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    {t('lastUpdated')}: {t('lastUpdatedValue')}
                </p>
                <p className="text-sm leading-relaxed mb-4">{t('termsIntro')}</p>
                {TERMS_SECTIONS.map((section) => (
                    <section key={section.heading}>
                        <h2 className="text-base font-bold text-brand-black mt-6 mb-2">
                            {t(section.heading)}
                        </h2>
                        {section.paragraphs.map((key) => (
                            <p key={key} className="text-sm leading-relaxed mb-2">
                                {t(key)}
                            </p>
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}
