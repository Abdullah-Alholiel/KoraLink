'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  CreditCard,
  Flag,
  Goal,
  LayoutDashboard,
  LogOut,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clearToken, getRole } from '@/lib/api';
import { SECTION_BY_ROLE, type ConsoleSection } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import LanguageToggle from '@/components/LanguageToggle';

const SECTION_META: Record<ConsoleSection, { href: string; labelKey: string; icon: typeof Users }> = {
  dashboard: { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  users: { href: '/users', labelKey: 'users', icon: Users },
  matches: { href: '/matches', labelKey: 'matches', icon: Trophy },
  venues: { href: '/venues', labelKey: 'venues', icon: MapPin },
  pitches: { href: '/pitches', labelKey: 'pitches', icon: Goal },
  disputes: { href: '/disputes', labelKey: 'disputes', icon: ShieldAlert },
  reports: { href: '/reports', labelKey: 'reports', icon: Flag },
  transactions: { href: '/transactions', labelKey: 'transactions', icon: CreditCard },
  settlements: { href: '/settlements', labelKey: 'settlements', icon: Wallet },
  settings: { href: '/settings', labelKey: 'settings', icon: Settings },
  audit: { href: '/audit', labelKey: 'auditLog', icon: ScrollText },
  'partner.dashboard': { href: '/partner', labelKey: 'dashboard', icon: LayoutDashboard },
  'partner.venues': { href: '/partner/venues', labelKey: 'myVenues', icon: MapPin },
  'partner.pitches': { href: '/partner/pitches', labelKey: 'myPitches', icon: Goal },
  'partner.matches': { href: '/partner/matches', labelKey: 'partnerMatches', icon: Trophy },
  'partner.earnings': { href: '/partner/earnings', labelKey: 'earnings', icon: Wallet },
  'partner.settings': { href: '/partner/settings', labelKey: 'settings', icon: Settings },
};

interface SidebarProps {
  /** <md: the sidebar is an overlay opened by the layout's menu button. */
  mobileOpen?: boolean;
  /** <md: close callback (backdrop tap, X, or link tap). */
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const role = getRole();
  const isPartner = role === 'VenueOwner';
  const sections = role ? SECTION_BY_ROLE[role] : [];

  // Roles are disjoint surfaces: admins see the HQ list only, venue owners
  // the partner list only (the old admin "partner portal" group was removed —
  // Abdullah, 2026-08-31). SECTION_BY_ROLE no longer mixes them.
  const visible = sections;

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const linkClass = cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-start text-sm font-medium transition',
  );

  const renderLink = (section: ConsoleSection, active: boolean) => {
    const item = SECTION_META[section];
    return (
      <Link
        key={section}
        href={item.href}
        onClick={onMobileClose}
        className={cn(linkClass, active ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white')}
      >
        <item.icon className="h-5 w-5" />
        {t(item.labelKey)}
      </Link>
    );
  };

  const header = (
    <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
      <Activity className="h-6 w-6 text-brand-500" />
      <span className="text-lg font-semibold text-white">KoraLink</span>
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
        {isPartner ? t('rolePartner') : role === 'Admin' ? t('roleHq') : ''}
      </span>
      {/* Mobile-only close button (the desktop sidebar is always visible). */}
      <button
        onClick={onMobileClose}
        aria-label="Close menu"
        className="ms-auto rounded-lg p-1.5 text-gray-300 hover:bg-white/10 hover:text-white md:hidden"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {visible.map((section) =>
        renderLink(
          section,
          pathname === SECTION_META[section].href || pathname.startsWith(`${SECTION_META[section].href}/`),
        ),
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <LanguageToggle />
      <button
        onClick={logout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-5 w-5" />
        {t('logout')}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (≥md) — physical left pinning (Abdullah 2026-08-31):
          a LEFT-hand panel in both locales — left-0, not start-0 — so it never
          moves between languages and is always visible next to the right-side
          edit drawers. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gray-900 text-gray-300 md:flex">
        {header}
        {nav}
        {footer}
      </aside>

      {/* Mobile sidebar (<md) — same panel as a slide-over overlay. */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <div
          onClick={onMobileClose}
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col bg-gray-900 text-gray-300 transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {header}
          {nav}
          {footer}
        </aside>
      </div>
    </>
  );
}
