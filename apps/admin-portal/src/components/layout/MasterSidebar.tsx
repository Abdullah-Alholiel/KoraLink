'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { getNavItems, type UserRole } from '@/config/navigation';
import { useAuthStore } from '@/store/auth-store';

interface MasterSidebarProps {
  role: UserRole;
}

/**
 * MasterSidebar — uses Tailwind logical properties exclusively so the sidebar
 * automatically docks to the right in RTL (Arabic) and the left in LTR (English).
 *
 * Key logical classes used:
 *   - `border-e`  → border-inline-end (right border in LTR, left in RTL)
 *   - `ps-*`      → padding-inline-start
 *   - `pe-*`      → padding-inline-end
 *   - `ms-*`      → margin-inline-start
 *
 * Navigation items are driven by the role-based config in
 * src/config/navigation.ts — no hardcoded lists here.
 */
export default function MasterSidebar({ role }: MasterSidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);

  const navItems = getNavItems(role);

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
          {navItems.map(({ labelKey, href, icon: Icon }) => {
            const isActive = pathname.endsWith(href);
            return (
              <li key={href}>
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
                  <span>{t(labelKey as Parameters<typeof t>[0])}</span>
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
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <LogOut className="size-5 shrink-0" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  );
}
