'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  MapPin,
  CalendarDays,
  Users,
  BarChart2,
  Settings,
  LogOut,
} from 'lucide-react';
import { clsx } from 'clsx';

type UserRole = 'ADMIN' | 'VENUE_OWNER';

interface NavItem {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const adminNavItems: NavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { key: 'venues', href: '/admin/venues', icon: MapPin },
  { key: 'bookings', href: '/admin/bookings', icon: CalendarDays },
  { key: 'users', href: '/admin/users', icon: Users },
  { key: 'reports', href: '/admin/reports', icon: BarChart2 },
  { key: 'settings', href: '/admin/settings', icon: Settings },
];

const partnerNavItems: NavItem[] = [
  { key: 'dashboard', href: '/partner', icon: LayoutDashboard },
  { key: 'venues', href: '/partner/venues', icon: MapPin },
  { key: 'bookings', href: '/partner/bookings', icon: CalendarDays },
  { key: 'reports', href: '/partner/reports', icon: BarChart2 },
  { key: 'settings', href: '/partner/settings', icon: Settings },
];

interface MasterSidebarProps {
  role: UserRole;
}

/**
 * MasterSidebar — uses Tailwind logical properties exclusively so the sidebar
 * automatically docks to the right in RTL (Arabic) and the left in LTR (English).
 *
 * Key logical classes used:
 *   - `border-e`        → border-inline-end (right border in LTR, left in RTL)
 *   - `ps-*`            → padding-inline-start
 *   - `pe-*`            → padding-inline-end
 *   - `ms-*`            → margin-inline-start
 */
export default function MasterSidebar({ role }: MasterSidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const navItems = role === 'ADMIN' ? adminNavItems : partnerNavItems;

  return (
    <aside className="flex h-screen w-64 flex-col bg-brand-sidebar border-e border-gray-700">
      {/* Logo / Branding */}
      <div className="flex h-16 items-center border-b border-gray-700 ps-5 pe-4">
        <span className="text-xl font-bold text-white">KoraLink</span>
        <span className="ms-2 rounded bg-brand-green px-2 py-0.5 text-xs font-medium text-white">
          {role === 'ADMIN' ? 'HQ' : 'Partner'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map(({ key, href, icon: Icon }) => {
            const isActive = pathname.endsWith(href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  className={clsx(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-green text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span>{t(key as Parameters<typeof t>[0])}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-700 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <LogOut className="size-5 shrink-0" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  );
}
