'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const i18n = {
  ar: {
    heading: 'حدث خطأ ما',
    retry: 'حاول مجدداً',
  },
  en: {
    heading: 'Something went wrong',
    retry: 'Try again',
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const locale = (pathname.split('/')[1] === 'ar' ? 'ar' : 'en') as keyof typeof i18n;
  const t = i18n[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg p-8 text-center">
      <h2 className="text-2xl font-bold text-brand-red">{t.heading}</h2>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-green px-6 py-2 text-white"
      >
        {t.retry}
      </button>
    </div>
  );
}
