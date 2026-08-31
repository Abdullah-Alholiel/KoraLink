'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRole, canAccessPath, homeForRole } from '@/lib/rbac';
import Sidebar from '@/components/Sidebar';

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

  const role = getRole();
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (!role || !canAccessPath(role, path)) {
    // Avoid rendering protected content during the redirect tick.
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    // pl-64 (physical, matching the left-pinned sidebar): the sidebar never
    // moves between locales (Abdullah 2026-08-31), so content clears it on
    // the left in both LTR and RTL.
    <div className="min-h-screen">
      <Sidebar />
      <main className="pl-64">{children}</main>
    </div>
  );
}
