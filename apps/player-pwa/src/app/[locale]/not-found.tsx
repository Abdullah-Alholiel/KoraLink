import Link from 'next/link';

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

export default function NotFound() {
  // Default to 'ar' (the app default) — locale detection from referrer
  // is unreliable. The middleware handles locale routing for valid paths.
  const locale: keyof typeof i18n = 'ar';
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
