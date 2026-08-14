'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { useAppStore, selectNotificationBadge } from '@/store/useAppStore';
import NotificationSheet from './NotificationSheet';

/**
 * Notification bell (US6) — full states:
 * default · unread (count badge, 99+ cap) · sheet open (loading/empty/
 * populated/error) · mark-all-read. Badge value is absolute from the server
 * (WS `notification`/`badge-sync`), multi-tab safe.
 */
export default function NotificationBell() {
  const t = useTranslations('notifications');
  const badge = useAppStore(selectNotificationBadge);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('title')}
        className="relative w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 active:scale-95 transition-transform"
      >
        <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.8} />
        {badge > 0 && (
          <span
            className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center border-2 border-white animate-scale-in"
            dir="ltr"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      <NotificationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
