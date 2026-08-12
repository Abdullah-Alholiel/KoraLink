'use client';

import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
      <p className="text-sm text-gray-500">{t('common.loading')}</p>
    </div>
  );
}
