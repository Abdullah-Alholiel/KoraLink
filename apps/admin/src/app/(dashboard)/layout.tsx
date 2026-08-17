'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRole, isAuthenticated } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    // Enforce role-scoped routing: venue owners use the partner portal,
    // admins use the HQ console.
    const role = getRole();
    const path = window.location.pathname;
    if (role === 'VenueOwner' && !path.startsWith('/partner')) {
      router.replace('/partner');
    } else if (role === 'Admin' && path.startsWith('/partner')) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="pl-64">{children}</main>
    </div>
  );
}
