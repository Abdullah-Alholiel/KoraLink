import Link from 'next/link';
import { headers } from 'next/headers';

const i18n = {
  ar: {
    heading: '404',
    message: 'الصفحة غير موجودة',
    back: 'العودة للرئيسية',
  },
  en: {
    heading: '404',
    message: 'Page not found',
    back: 'Back to Home',
  },
} as const;

export default async function NotFound() {
  const headersList = await headers();
  const referer = headersList.get('referer') ?? '';
  // Detect locale from the referer URL or default to 'en'
  const localeMatch = referer.match(/\/(\w{2})\//);
  const locale = (localeMatch?.[1] === 'ar' ? 'ar' : 'en') as keyof typeof i18n;
  const t = i18n[locale];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg p-8 text-center">
      <h2 className="text-4xl font-bold text-brand-black">{t.heading}</h2>
      <p className="text-lg text-gray-600">{t.message}</p>
      <Link
        href={`/${locale}`}
        className="rounded-lg bg-brand-green px-6 py-2 text-white"
      >
        {t.back}
      </Link>
    </div>
  );
}
