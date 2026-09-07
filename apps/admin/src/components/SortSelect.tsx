'use client';

import { useTranslations } from 'next-intl';

interface SortOption {
  value: string;
  label: string;
}

interface SortSelectProps {
  /** Current sortBy key; '' = endpoint default. */
  value: string;
  options: SortOption[];
  onChange: (value: string) => void;
}

/**
 * Sorting moves to a control (reel move 5): hidden columns are not deleted,
 * and the sort is no longer buried in desktop-only column headers. Writes
 * ?sortBy= into the page's query string; useLiveAdminData refetches on path
 * change automatically.
 */
export default function SortSelect({ value, options, onChange }: SortSelectProps) {
  const tl = useTranslations('list');

  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-500">
      <span className="hidden sm:inline">{tl('sortLabel')}</span>
      <select
        aria-label={tl('sortLabel')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
