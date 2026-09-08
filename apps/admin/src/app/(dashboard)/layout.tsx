'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Menu, X } from 'lucide-react';
import { getRole, canAccessPath, homeForRole } from '@/lib/rbac';
import Sidebar from '@/components/Sidebar';
import OfflineBanner from '@/components/OfflineBanner';

/**
 * Console layout guard.
 *
 * Waits for the token to be readable (client mount), then:
 *  - no token → /login
 *  - Player (no console access at all) → /login with a clear message
 *  - role may not open this section → role home (admins never see /partner
 *    links, owners never see HQ links, so this is a deep-link/back-button
 *    safety net rather than an everyday path)
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Phone/tablet navigation: the sidebar collapses below md and opens as an
  // overlay (2026-09-07 table-restructure — the fixed pl-64 crushed 390px
  // viewports and forced every page into horizontal scroll).
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const role = getRole();
    if (!role) {
      router.replace('/login');
      return;
    }
    const path = window.location.pathname;
    if (role === 'Player') {
      router.replace('/login?error=player');
      return;
    }
    if (!canAccessPath(role, path)) {
      router.replace(homeForRole(role));
    }
  }, [router]);

  // Esc closes the mobile nav overlay.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const role = getRole();
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (!role || !canAccessPath(role, path)) {
    // Avoid rendering protected content during the redirect tick.
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    // md:pl-64 (physical, matching the left-pinned sidebar): the sidebar never
    // moves between locales (Abdullah 2026-08-31). Below md the sidebar hides
    // and content goes full-width (mobile top bar with a menu button instead).
    <div className="min-h-screen">
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />

      {/* Mobile top bar (<md only): brand + menu button. */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-gray-900 px-4 md:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Menu"
          className="rounded-lg p-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-brand-500" />
          <span className="text-base font-semibold text-white">KoraLink</span>
        </div>
      </div>

      {/* Console-wide offline indicator (run #42) — one banner covers every
          HQ + partner route; renders nothing while online. */}
      <OfflineBanner />

      <main className="md:pl-64">{children}</main>
    </div>
  );
}
