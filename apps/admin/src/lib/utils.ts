import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Console locale from <html lang> (set by the i18n boot script + store). */
function currentLocale(): 'en' | 'ar' {
  if (typeof document === 'undefined') return 'en';
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

/** Money formatter: localized currency label, Latin digits (finance convention). */
export function formatMoney(value: number | string | null | undefined): string {
  const locale = currentLocale();
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (Number.isNaN(n)) return locale === 'ar' ? '0 ر.س' : 'SAR 0';
  const num = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return locale === 'ar' ? `${num} ر.س` : `SAR ${num}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Timestamp formatter. Kept on the en-GB shape for BOTH locales (v1):
 * timestamps render inside dir="ltr" cells, and Latin-digit dates stay
 * scannable for operations staff in either language.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
