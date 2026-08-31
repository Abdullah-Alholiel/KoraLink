'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * App-router 404 page. Without this file, Next serves its synthesized
 * pages-router /404 fallback, whose prerender crashed the production build
 * (run #19: "Html should not be imported outside of pages/_document" on
 * /404 // /500 after the first fresh build post-lockfile-sync). The PWA
 * ships the same file — admin now matches.
 */
export default function NotFound() {
  const t = useTranslations('hq');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{t('notFoundTitle')}</h1>
      <p className="text-sm text-gray-500">{t('notFoundBody')}</p>
      <Link
        href="/"
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Back to console
      </Link>
    </div>
  );
}
