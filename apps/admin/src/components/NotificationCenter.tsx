'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell,
  CreditCard,
  Flag,
  Goal,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Trash2,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import Drawer from '@/components/Drawer';
import { getRole } from '@/lib/api';
import { trackEvent } from '@/providers/ObservabilityProvider';
import {
  clearOpsActivity,
  isEntityInScope,
  recordOpsEvent,
  setFeedOpen,
  useOpsActivity,
  type OpsEntity,
} from '@/lib/ops-activity-store';
import { opsRealtime } from '@/lib/ops-realtime';

/** Entity → lucide icon (same icon the sidebar uses for the section). */
const ENTITY_ICON: Record<OpsEntity, typeof Users> = {
  users: Users,
  matches: Trophy,
  venues: MapPin,
  pitches: Goal,
  disputes: ShieldAlert,
  transactions: CreditCard,
  settlements: Wallet,
  settings: Settings,
  reports: Flag,
};

/** Entity chip class. Ops pings carry no severity — no red/amber noise. */
const ENTITY_CHIP: Record<OpsEntity, string> = {
  users: 'bg-brand-50 text-brand-700',
  matches: 'bg-brand-50 text-brand-700',
  venues: 'bg-brand-50 text-brand-700',
  pitches: 'bg-brand-50 text-brand-700',
  disputes: 'bg-brand-50 text-brand-700',
  transactions: 'bg-brand-50 text-brand-700',
  settlements: 'bg-brand-50 text-brand-700',
  settings: 'bg-gray-100 text-gray-600',
  reports: 'bg-brand-50 text-brand-700',
};

/**
 * Where a click on an entity event lands, per role. Admins land on the HQ
 * table; venue owners only have partner surfaces (venues/pitches/matches/
 * earnings) — everything else falls back to the partner dashboard. The
 * target page refetches live on mount (useLiveAdminData), so the link
 * always shows current truth.
 */
const ENTITY_PATH_BY_ROLE: Record<'Admin' | 'VenueOwner', Partial<Record<OpsEntity, string>>> = {
  Admin: {
    users: '/users',
    matches: '/matches',
    venues: '/venues',
    pitches: '/pitches',
    disputes: '/disputes',
    reports: '/reports',
    transactions: '/transactions',
    settlements: '/settlements',
    settings: '/settings',
  },
  VenueOwner: {
    venues: '/partner/venues',
    pitches: '/partner/pitches',
    matches: '/partner/matches',
    transactions: '/partner/earnings',
    settlements: '/partner/earnings',
  },
};

/**
 * Coarse relative age. Deliberately NOT Intl.RelativeTimeFormat: one tick
 * timer per open feed is enough to keep "just now" honest, and the unit
 * selection stays trivial to translate.
 */
function ageParts(
  at: number,
  now: number,
): { unit: 'now' | 'minutes' | 'hours' | 'days'; n: number } {
  const secs = Math.max(0, Math.floor((now - at) / 1000));
  if (secs < 60) return { unit: 'now', n: 0 };
  const mins = Math.floor(secs / 60);
  if (mins < 60) return { unit: 'minutes', n: mins };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { unit: 'hours', n: hours };
  return { unit: 'days', n: Math.floor(hours / 24) };
}

/**
 * Console-wide notification surface (kanban t_8cdabf05, run #98 Reviewer B:
 * ops learned of disputes/reports/refund requests only by manual page
 * refresh).
 *
 * Mounted ONCE in the (dashboard) layout. Owns the shared ops socket
 * (ref-counted singleton — exactly one /lobby connection per session) and
 * records `ops-data-changed` pings into the activity store. The feed is the
 * shared Drawer so it follows the console's drawer conventions (Esc,
 * backdrop, focus trap, left-anchored panel).
 *
 * Ops pings are intentionally payload-free (`{ entity }` only — no row data
 * crosses the socket), so rows read "<Entity> updated — N changes" and click
 * through to the live table, which refetches on mount.
 */
export default function NotificationCenter() {
  const router = useRouter();
  const t = useTranslations('notifications');
  const { entries, feedOpen } = useOpsActivity();
  const [now, setNow] = useState(() => Date.now());

  // The socket lives exactly as long as this mounted component (the layout
  // keeps it alive for the whole console session; route changes unmount only
  // page content, not the layout).
  useEffect(() => {
    opsRealtime.connect();
    const off = opsRealtime.on('ops-data-changed', (payload) => {
      const entity =
        payload && typeof payload === 'object' && 'entity' in payload
          ? String((payload as { entity: unknown }).entity)
          : '';
      if (entity && isEntityInScope(getRole(), entity)) recordOpsEvent(entity);
    });
    return () => {
      off();
      opsRealtime.disconnect();
    };
  }, []);

  // Keep relative timestamps fresh while the feed is open (30s is plenty).
  // Re-baseline the clock the moment the drawer opens — events that arrived
  // while it was closed must not render as "Just now" against a stale
  // mount-time `now` (PR-Agent finding, run #99).
  useEffect(() => {
    if (!feedOpen) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [feedOpen]);

  const role = getRole();
  const roleKey: 'Admin' | 'VenueOwner' = role === 'VenueOwner' ? 'VenueOwner' : 'Admin';
  const pathByEntity = ENTITY_PATH_BY_ROLE[roleKey];

  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const Icon = ENTITY_ICON[entry.entity];
        const href =
          pathByEntity[entry.entity] ?? (roleKey === 'VenueOwner' ? '/partner' : '/dashboard');
        const age = ageParts(entry.at, now);
        return { entry, Icon, href, age };
      }),
    // pathByEntity/roleKey derive from the JWT in localStorage — stable for
    // the session; entries + now are the real re-render drivers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, now],
  );

  function go(href: string, entity: OpsEntity) {
    setFeedOpen(false);
    trackEvent('admin_notifications_navigate', { entity });
    router.push(href);
  }

  return (
    <Drawer
      open={feedOpen}
      onClose={() => setFeedOpen(false)}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <button
          onClick={clearOpsActivity}
          disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <Trash2 className="h-4 w-4" />
          {t('clearAll')}
        </button>
      }
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <ScrollText className="h-8 w-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">{t('emptyTitle')}</h3>
          <p className="mt-1 text-sm text-gray-400">{t('emptyHint')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(({ entry, Icon, href, age }) => (
            <li key={entry.key}>
              <button
                onClick={() => go(href, entry.entity)}
                className="flex w-full items-center gap-3 px-1 py-3 text-start hover:bg-gray-50"
              >
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${ENTITY_CHIP[entry.entity]}`}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {t(`entity.${entry.entity}`)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                    <span>
                      {age.unit === 'now'
                        ? t('timeNow')
                        : t(`time.${age.unit}`, { count: age.n })}
                    </span>
                    {entry.count > 1 && (
                      <span className="font-medium text-gray-500">
                        {t('changes', { count: entry.count })}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

interface BellButtonProps {
  /**
   * `sidebar` (default): dark footer row, full-width with label — sits under
   * LanguageToggle in the Sidebar footer (desktop + mobile slide-over).
   * `bar`: icon-only button with badge — the <md mobile top bar.
   */
  variant?: 'sidebar' | 'bar';
}

/**
 * The bell + unread badge. Renders from the SAME activity store the feed
 * reads (useSyncExternalStore), so any NotificationCenter mount — wherever
 * the layout puts it — drives every bell on screen. Opening the feed clears
 * the badge in the store; all bells update together.
 */
export function BellButton({ variant = 'sidebar' }: BellButtonProps) {
  const t = useTranslations('notifications');
  const { unread } = useOpsActivity();

  function open() {
    setFeedOpen(true);
    trackEvent('admin_notifications_feed_open', { unread });
  }

  if (variant === 'bar') {
    return (
      <button
        onClick={open}
        aria-label={t('bellAria')}
        className="relative rounded-lg p-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-5 w-5" strokeWidth={1.5} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={open}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
    >
      <span className="relative">
        <Bell className="h-5 w-5" strokeWidth={1.5} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </span>
      {t('bell')}
    </button>
  );
}
