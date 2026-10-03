'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Menu, X } from 'lucide-react';
import { getRole, canAccessPath, homeForRole } from '@/lib/rbac';
import type { Role } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import OfflineBanner from '@/components/OfflineBanner';
import NotificationCenter, { BellButton } from '@/components/NotificationCenter';

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
  // PR-Agent security note (PR #51 round 3): freezing the path check at mount
  // let in-app navigations to a disallowed route render the page shell until
  // the API 403s. usePathname() is SSR-safe (no hydration hazard) and makes
  // the check per-navigation again, while render stays a pure function of
  // hook state (P2-124's original fix stands — no window/localStorage reads).
  const pathname = usePathname();
  // Phone/tablet navigation: the sidebar collapses below md and opens as an
  // overlay (2026-09-07 table-restructure — the fixed pl-64 crushed 390px
  // viewports and forced every page into horizontal scroll).
  const [navOpen, setNavOpen] = useState(false);
  // P2-124 (run #86): the guard used to read localStorage (getRole) and
  // window.location.pathname DURING RENDER — an SSR/CSR mismatch hazard and a
  // 'null' flash on every hard navigation. The role is now resolved ONCE in
  // the mount effect and held in state; render stays a pure function of it
  // (null = still deciding → placeholder, exactly the old UX).
  const [guardRole, setGuardRole] = useState<Role | null>(null);

  useEffect(() => {
    const role = getRole();
    if (!role) {
      // Clear any cached role so protected children stop rendering on the
      // redirect (checked per navigation; an idle tab with a revoked token
      // keeps the old shell until its next navigation — same window as the
      // old render-time read, no regression; cross-tab reactivity = future
      // `storage`-listener work, out of P2-124 scope).
      setGuardRole(null);
      router.replace('/login');
      return;
    }
    if (role === 'Player') {
      setGuardRole(null);
      router.replace('/login?error=player');
      return;
    }
    setGuardRole(role);
    // Path-based redirect on every navigation (deep-link / back-button safety
    // net, restored per PR-Agent round 3) — canAccessPath reads `pathname`.
    if (!canAccessPath(role, pathname)) {
      router.replace(homeForRole(role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname is the
    // navigation trigger; role re-derives from storage each pass.
  }, [router, pathname]);

  // Esc closes the mobile nav overlay.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Render is a pure function of hook state — no window/localStorage reads.
  // Path-based access is re-checked on EVERY navigation (guardRole + pathname
  // both feed the decision), so a cross-role in-app link redirects instantly.
  if (!guardRole || !canAccessPath(guardRole, pathname)) {
    // Avoid rendering protected content during the redirect tick.
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    // md:pl-64 (physical, matching the left-pinned sidebar): the sidebar never
    // moves between locales (Abdullah 2026-08-31). Below md the sidebar hides
    // and content goes full-width (mobile top bar with a menu button instead).
    <div className="min-h-screen">
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />

      {/* Mobile top bar (<md only): brand + menu + notifications. */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-gray-900 px-4 md:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Menu"
          className="rounded-lg p-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <Activity className="h-5 w-5 text-brand-500" />
          <span className="text-base font-semibold text-white">KoraLink</span>
        </div>
        {/* Icon-only bell with the shared unread badge (t_8cdabf05). */}
        <BellButton variant="bar" />
      </div>

      {/* Console-wide offline indicator (run #42) — one banner covers every
          HQ + partner route; renders nothing while online. */}
      <OfflineBanner />

      {/* Console-wide notification surface (t_8cdabf05): ONE shared /lobby
          socket for the whole session, records ops-data-changed pings, hosts
          the feed drawer. The Sidebar footer bell reads the same store. */}
      <NotificationCenter />

      <main className="md:pl-64">{children}</main>
    </div>
  );
}
