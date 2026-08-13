'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore, selectIsAuth, selectUser } from '@/store/useAppStore';

/**
 * Client-side auth guard for the (main) route group.
 *
 * Redirects unauthenticated users to the login page.
 * Shows a brief loading state while Zustand hydrates from localStorage
 * to prevent flash-of-content before the auth state is known.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const isAuthenticated = useAppStore(selectIsAuth);
    const user = useAppStore(selectUser);
    const isHydrated = useAppStore((s) => s.isHydrated);
    const [showLoading, setShowLoading] = useState(true);

    useEffect(() => {
        // Wait for Zustand to hydrate from localStorage before deciding
        if (!isHydrated) return;
        setShowLoading(false);

        if (!isAuthenticated || !user) {
            router.replace(`/${locale}/login`);
        }
    }, [isHydrated, isAuthenticated, user, router, locale]);

    // While hydrating, show a neutral loading state (prevents auth-content flash)
    if (showLoading || (!isHydrated)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-green rounded-full animate-spin" />
            </div>
        );
    }

    // If unauthenticated after hydration, show nothing (redirect is in-flight)
    if (!isAuthenticated || !user) {
        return null;
    }

    return <>{children}</>;
}
