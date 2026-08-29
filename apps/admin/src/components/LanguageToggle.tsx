'use client';

import { Languages } from 'lucide-react';
import { setAdminLocale, useAdminLocale } from '@/i18n/locale-store';

/**
 * Locale switcher for the console sidebar footer.
 * Shows "العربية" when in English and "English" when in Arabic.
 */
export default function LanguageToggle() {
  const locale = useAdminLocale();
  const next = locale === 'en' ? 'ar' : 'en';
  return (
    <button
      onClick={() => setAdminLocale(next)}
      aria-label={locale === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
      title={locale === 'en' ? 'العربية' : 'English'}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
    >
      <Languages className="h-5 w-5" />
      <span dir="ltr">{locale === 'en' ? 'العربية' : 'English'}</span>
    </button>
  );
}
