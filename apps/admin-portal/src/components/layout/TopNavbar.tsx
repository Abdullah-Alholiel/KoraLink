'use client';

import { useTranslations } from 'next-intl';
import { Bell, Search } from 'lucide-react';

/**
 * TopNavbar — top navigation bar for the admin portal.
 * Uses logical padding classes (ps-*, pe-*) for RTL/LTR compatibility.
 */
export default function TopNavbar() {
  const t = useTranslations('app');

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Search */}
      <div className="flex items-center gap-2">
        <Search className="size-5 text-gray-400" aria-hidden="true" />
        <span className="text-sm text-gray-400">{t('title')}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          <span className="absolute end-0 top-0 size-2 rounded-full bg-brand-red" />
        </button>

        {/* Avatar placeholder */}
        <div className="size-8 rounded-full bg-brand-green" aria-hidden="true" />
      </div>
    </header>
  );
}
