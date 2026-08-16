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
  rejected: 'bg-red-100 text-red-700',
  banned: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  reversed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
  suspended: 'bg-orange-100 text-orange-700',
};

export default function StatusBadge({ status }: { status: string | null | undefined }) {
  const label = status ? String(status).replace(/_/g, ' ') : 'unknown';
  const key = (status ?? 'unknown').toLowerCase();
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
