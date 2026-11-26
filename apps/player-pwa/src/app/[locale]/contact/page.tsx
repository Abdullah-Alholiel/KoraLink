'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Mail } from 'lucide-react';

// Run #233 (P2-405): Contact + PDPL-requests page. Same shell as the
// terms/privacy pages, rendered from the `contact` namespace as a section
// array so EN+AR stay structurally identical. Live content — no draft banner.
type ContactSection = { heading: string; paragraphs: string[] };

const SUPPORT_EMAIL = 'hello@koralink.sa';

const CONTACT_SECTIONS: ContactSection[] = [
  {
    heading: 'supportH',
    paragraphs: ['supportBody1', 'supportBody2'],
  },
  {
    heading: 'pdplH',
    paragraphs: ['pdplBody1', 'pdplBody2'],
  },
  {
    heading: 'responseH',
    paragraphs: ['responseBody1'],
  },
];

export default function ContactPage() {
    const router = useRouter();
    const locale = useLocale();
    const t = useTranslations('contact');
    const tCommon = useTranslations('common');

    // Deep-link back navigation (PR-Agent #302 MINOR): router.back() dead-ends
    // when the page was opened directly (shared link / QR — empty history).
    // Fall back to the feed so the button always leads somewhere in-app.
    const goBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(`/${locale}`);
    };

    return (
        <div className="min-h-dvh bg-brand-bg">
            <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-3 flex-shrink-0 bg-white">
                <button
                    onClick={goBack}
                    aria-label={tCommon('back')}
                    className="w-9 h-9 min-h-hit min-w-hit flex items-center justify-center rounded-full hover:bg-gray-50"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    {t('title')}
                </h1>
            </div>
            <div className="p-6 max-w-none text-gray-600">
                <p className="text-sm leading-relaxed mb-4">{t('intro')}</p>
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-4 py-4 min-h-hit shadow-sm hover:bg-gray-50"
                >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                        <Mail className="h-5 w-5 text-brand-green" strokeWidth={1.75} />
                    </span>
                    <span className="flex flex-col">
                        <span className="text-xs text-gray-500">{t('emailCardLabel')}</span>
                        <span className="text-base font-bold text-brand-black" dir="ltr">
                            {SUPPORT_EMAIL}
                        </span>
                        <span className="text-xs text-gray-400">{t('emailCardHint')}</span>
                    </span>
                </a>
                {CONTACT_SECTIONS.map((section) => (
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
