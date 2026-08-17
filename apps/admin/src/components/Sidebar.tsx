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
import { cn } from '@/lib/utils';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/matches', label: 'Matches', icon: Trophy },
  { href: '/venues', label: 'Venues', icon: MapPin },
  { href: '/disputes', label: 'Disputes', icon: ShieldAlert },
  { href: '/transactions', label: 'Transactions', icon: CreditCard },
  { href: '/settlements', label: 'Settlements', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
];

const partnerNav = [
  { href: '/partner', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/partner/pitches', label: 'My Pitches', icon: MapPin },
  { href: '/partner/earnings', label: 'Earnings', icon: Wallet },
  { href: '/partner/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const role = getRole();
  const isPartner = role === 'VenueOwner';
  const nav = isPartner ? partnerNav : adminNav;

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
          {isPartner ? 'Partner' : 'HQ'}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
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
