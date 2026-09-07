'use client';

import { useTranslations } from 'next-intl';

import { trackEvent } from '@/providers/ObservabilityProvider';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import Drawer from '@/components/Drawer';

export interface RecordDrawerField {
  label: string;
  value: React.ReactNode;
}

interface RecordDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Labeled mono ID row — hidden ≠ deleted (reel move 5). */
  recordId?: string;
  /** Full record: every column the table dropped. */
  fields: RecordDrawerField[];
  /** Row actions (refund, ban, pay out…) — same handlers as before. */
  actions?: React.ReactNode;
  /** "Open full page" link where a detail route exists. */
  footerLink?: { href: string; label: string };
  /** Analytics discriminator, e.g. 'admin.users'. */
  page: string;
}

/**
 * Tap-for-details drawer (reel moves 5 + 6): the table row stays thumb-sized,
 * the ID / secondary fields / actions slide in here instead of hiding behind
 * a horizontal scroll. Built on the shared right-anchored Drawer.
 */
export default function RecordDrawer({
  open,
  onClose,
  title,
  recordId,
  fields,
  actions,
  footerLink,
  page,
}: RecordDrawerProps) {
  const t = useTranslations('list');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        actions || footerLink ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {footerLink && (
              <a
                href={footerLink.href}
                onClick={() => trackEvent('admin_record_open', { page, via: 'footer_link' })}
                className="ms-auto text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {footerLink.label} →
              </a>
            )}
          </div>
        ) : undefined
      }
    >
      <div
        onClick={() => trackEvent('admin_record_open', { page, via: 'row_tap' })}
        className="space-y-4"
      >
        {recordId && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {t('idLabel')}
            </div>
            <div className="mt-0.5 font-mono text-sm text-gray-700" dir="ltr">
              {recordId}
            </div>
          </div>
        )}
        <dl className="divide-y divide-gray-100">
          {fields.map((f) => (
            <div key={f.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-sm text-gray-500">{f.label}</dt>
              <dd className="text-end text-sm font-medium text-gray-900">{f.value}</dd>
            </div>
          ))}
        </dl>
        {!recordId && !fields.length && (
          <p className="text-sm text-gray-400">{t('noDetails')}</p>
        )}
      </div>
    </Drawer>
  );
}
