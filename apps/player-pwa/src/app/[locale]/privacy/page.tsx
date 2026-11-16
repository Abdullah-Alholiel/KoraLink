'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

// Run #205 (launch lane F4): PDPL-structured privacy notice, rendered from the
// `legal` namespace as a section array so EN+AR stay structurally identical.
// Content is a DRAFT pending lawyer review (draftBanner surfaces this in-app).
type LegalSection = { heading: string; paragraphs: string[] };

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'privacyControllerH',
    paragraphs: ['privacyControllerBody1', 'privacyControllerBody2'],
  },
  {
    heading: 'privacyScopeH',
    paragraphs: ['privacyScopeBody1', 'privacyScopeBody2'],
  },
  {
    heading: 'privacyDataCategoriesH',
    paragraphs: [
      'privacyDataCategoriesBody1',
      'privacyDataCategoriesBody2',
      'privacyDataCategoriesBody3',
      'privacyDataCategoriesBody4',
      'privacyDataCategoriesBody5',
      'privacyDataCategoriesBody6',
      'privacyDataCategoriesBody7',
    ],
  },
  {
    heading: 'privacyLawfulBasisH',
    paragraphs: [
      'privacyLawfulBasisBody1',
      'privacyLawfulBasisBody2',
      'privacyLawfulBasisBody3',
      'privacyLawfulBasisBody4',
    ],
  },
  {
    heading: 'privacyDataUseH',
    paragraphs: [
      'privacyDataUseBody1',
      'privacyDataUseBody2',
      'privacyDataUseBody3',
      'privacyDataUseBody4',
      'privacyDataUseBody5',
      'privacyDataUseBody6',
    ],
  },
  {
    heading: 'privacySharingH',
    paragraphs: [
      'privacySharingBody1',
      'privacySharingBody2',
      'privacySharingBody3',
      'privacySharingBody4',
      'privacySharingBody5',
    ],
  },
  {
    heading: 'privacyRetentionH',
    paragraphs: [
      'privacyRetentionBody1',
      'privacyRetentionBody2',
      'privacyRetentionBody3',
      'privacyRetentionBody4',
      'privacyRetentionBody5',
      'privacyRetentionBody6',
    ],
  },
  {
    heading: 'privacyRightsH',
    paragraphs: [
      'privacyRightsIntro',
      'privacyRight1',
      'privacyRight2',
      'privacyRight3',
      'privacyRight4',
      'privacyRight5',
      'privacyRight6',
      'privacyRight7',
      'privacyRight8',
    ],
  },
  {
    heading: 'privacyTransfersH',
    paragraphs: ['privacyTransfersBody1'],
  },
  {
    heading: 'privacySecurityH',
    paragraphs: ['privacySecurityBody1'],
  },
  {
    heading: 'privacyBreachH',
    paragraphs: ['privacyBreachBody1'],
  },
  {
    heading: 'privacyChildrenH',
    paragraphs: ['privacyChildrenBody1'],
  },
  {
    heading: 'privacyCookiesH',
    paragraphs: ['privacyCookiesBody1'],
  },
  {
    heading: 'privacyContactH',
    paragraphs: ['privacyContactBody1'],
  },
  {
    heading: 'privacyComplaintsH',
    paragraphs: ['privacyComplaintsBody1'],
  },
  {
    heading: 'privacyChangesH',
    paragraphs: ['privacyChangesBody1'],
  },
];

export default function PrivacyPage() {
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
                    {t('privacyTitle')}
                </h1>
            </div>
            <div className="p-6 max-w-none text-gray-600">
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-800">{t('draftBanner')}</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    {t('lastUpdated')}: {t('lastUpdatedValue')}
                </p>
                <p className="text-sm leading-relaxed mb-4">{t('privacyIntro')}</p>
                {PRIVACY_SECTIONS.map((section) => (
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
