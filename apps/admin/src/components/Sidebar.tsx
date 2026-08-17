'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { clearToken, getRole } from '@/lib/api';
import { SECTION_BY_ROLE, type ConsoleSection } from '@/lib/rbac';
import { cn } from '@/lib/utils';

const SECTION_META: Record<ConsoleSection, { href: string; label: string; icon: typeof Users }> = {
  dashboard: { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  users: { href: '/users', label: 'Users', icon: Users },
  matches: { href: '/matches', label: 'Matches', icon: Trophy },
  venues: { href: '/venues', label: 'Venues', icon: MapPin },
  disputes: { href: '/disputes', label: 'Disputes', icon: ShieldAlert },
  transactions: { href: '/transactions', label: 'Transactions', icon: CreditCard },
  settlements: { href: '/settlements', label: 'Settlements', icon: Wallet },
  settings: { href: '/settings', label: 'Settings', icon: Settings },
  audit: { href: '/audit', label: 'Audit Log', icon: ScrollText },
  'partner.dashboard': { href: '/partner', label: 'Dashboard', icon: LayoutDashboard },
  'partner.venues': { href: '/partner/venues', label: 'My Venues', icon: MapPin },
  'partner.pitches': { href: '/partner/pitches', label: 'My Pitches', icon: MapPin },
  'partner.earnings': { href: '/partner/earnings', label: 'Earnings', icon: Wallet },
  'partner.settings': { href: '/partner/settings', label: 'Settings', icon: Settings },
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const role = getRole();
  const isPartner = role === 'VenueOwner';
  const sections = role ? SECTION_BY_ROLE[role] : [];

  // Split at the partner boundary so admins get an explicit group label when
  // they open the partner portal.
  const hqSections = sections.filter((s) => !s.startsWith('partner.'));
  const partnerSections = sections.filter((s) => s.startsWith('partner.'));

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gray-900 text-gray-300">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
        <Activity className="h-6 w-6 text-brand-500" />
        <span className="text-lg font-semibold text-white">KoraLink</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {isPartner ? 'Partner' : role === 'Admin' ? 'HQ' : ''}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {hqSections.map((section) => {
          const item = SECTION_META[section];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={section}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white',
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        {/* Admins see the partner portal as a separate labelled group. */}
        {partnerSections.length > 0 && role === 'Admin' && (
          <>
            <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Partner portal
            </p>
            {partnerSections.map((section) => {
              const item = SECTION_META[section];
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={section}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}

        {/* Venue owners just get their flat list (rendered above when Admin
            has no HQ sections… but for owners hqSections is empty, so render
            theirs directly). */}
        {role === 'VenueOwner' &&
          partnerSections.map((section) => {
            const item = SECTION_META[section];
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={section}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </div>
    </aside>
  );
}
