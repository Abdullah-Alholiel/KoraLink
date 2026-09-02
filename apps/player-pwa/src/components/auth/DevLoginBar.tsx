'use client';

import { useState, useEffect, type ReactElement } from 'react';
import { useLocale } from 'next-intl';
import { fetcher, setAuthToken } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import type { UserProfileApi } from '@/hooks/useUser';

// P0-7 (run #26): build-time exclusion of dev-login shortcuts from production
// bundles. Setting NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR=true at build time
// short-circuits the entire component (returns null + the phone list is
// tree-shaken out of the bundle). The previous hostname/NODE_ENV gate kept
// the dev code reachable at runtime — the run-#25 Strix finding (CVSS 9.1).
// The API also enforces the gate independently via DEV_LOGIN_ENABLED.
const DEV_LOGIN_BAR_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_DEV_LOGIN_BAR === 'true';

/**
 * Dev-only quick-login buttons for seeded users.
 * When the build-time flag is ON, the component is a constant no-op (the
 * compiled bundle contains only the null return + the flag check). When OFF
 * (dev box), the same component runs the seeded-phone quick-login UI. The
 * additional runtime hostname check keeps a dev bundle from leaking onto a
 * non-private host.
 */
export default function DevLoginBar(): ReactElement | null {
  // P0-7 (run #26): the build-time check must run BEFORE any hooks so the
  // hooks tree is identical in both branches — otherwise React would log a
  // hooks-order error if a future edit changes one branch's hook count.
  if (DEV_LOGIN_BAR_DISABLED) {
    return null;
  }
  return <DevLoginBarInner />;
}

function DevLoginBarInner(): ReactElement | null {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsLocalhost(
      process.env.NODE_ENV !== 'production' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('100.') ||
      hostname.includes('.ts.net')
    );
  }, []);

  if (!isLocalhost) return null;

  const seededPhones = [
    { phone: '+966500000001', name: 'Ahmed Al-Rashid' },
    { phone: '+966500000002', name: 'Khalid Al-Otaibi' },
    { phone: '+966500000003', name: 'Faisal Al-Harbi' },
    { phone: '+966500000004', name: 'Omar Al-Shahrani' },
    { phone: '+966500000005', name: 'Yousef Al-Qahtani' },
  ];

  const devLogin = async (phone: string) => {
    setLoading(phone);
    setError(null);
    try {
      const res = await fetcher<{ message: string; token?: string }>(
        '/auth/dev-login',
        { method: 'POST', body: JSON.stringify({ phone, surface: 'player' }) }
      );
      if (res.token) setAuthToken(res.token);

      // Populate Zustand user — cascade-fixes join detection, host check,
      // isAuthenticated, stats, and profile display.
      try {
        const profile = await fetcher<UserProfileApi>('/users/me', {
          headers: res.token ? { Authorization: `Bearer ${res.token}` } : {},
        });
        const skillLevel = (profile.skill_level?.toLowerCase() ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced';
        useAppStore.getState().login({
          id: profile.id,
          fullName: profile.full_name ?? '',
          handle: profile.handle ?? '',
          avatarUrl: profile.avatar_url ?? '',
          phone: profile.phone,
          preferredLocation: profile.preferred_location ?? '',
          preferredPosition: profile.preferred_position ?? '',
          skillLevel,
          locale: locale as 'ar' | 'en',
        }, res.token ?? '');
      } catch {
        // Profile fetch may fail; Zustand stays null, UI shows fallback
      }

      window.location.href = `/${locale}/play`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-6 border-t border-dashed border-amber-300 pt-4">
      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 text-center">
        🔧 Dev Quick Login
      </p>
      <div className="space-y-2">
        {seededPhones.map((u) => (
          <button
            key={u.phone}
            onClick={() => devLogin(u.phone)}
            disabled={loading !== null}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] ${
              loading === u.phone
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            {loading === u.phone ? (
              'Signing in...'
            ) : (
              <>
                Login as <strong>{u.name}</strong>
              </>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-brand-red text-center mt-2">{error}</p>
      )}
    </div>
  );
}
