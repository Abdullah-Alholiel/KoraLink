'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  paid: 'bg-green-100 text-green-700',
  resolved: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  opened: 'bg-blue-100 text-blue-700',
  open: 'bg-blue-100 text-blue-700',
  under_review: 'bg-blue-100 text-blue-700',
  full: 'bg-purple-100 text-purple-700',
  inprogress: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  banned: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  reversed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
  suspended: 'bg-orange-100 text-orange-700',
};

/** Known wire statuses get catalog labels; unknowns fall back to the raw value. */
const KNOWN = new Set([
  'approved', 'active', 'completed', 'paid', 'resolved', 'pending', 'opened', 'open',
  'under_review', 'full', 'inprogress', 'rejected', 'banned', 'failed', 'reversed',
  'cancelled', 'suspended', 'booked', 'available', 'inactive',
]);

export default function StatusBadge({ status }: { status: string | null | undefined }) {
  const t = useTranslations('status');
  const raw = status ? String(status) : 'unknown';
  const key = raw.toLowerCase();
  const label = KNOWN.has(key) ? t(key) : raw.replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        styles[key] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {label}
    </span>
  );
}
