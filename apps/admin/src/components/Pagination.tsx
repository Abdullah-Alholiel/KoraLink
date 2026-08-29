'use client';

import { useTranslations } from 'next-intl';

export default function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-8 py-4">
      <span className="text-sm text-gray-500">
        {t('resultCount', { count: total })}
      </span>
      <div className="flex items-center gap-3">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {t('prev')}
        </button>
        <span className="text-sm text-gray-600">
          {t('pageOf', { page, pages })}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
}
