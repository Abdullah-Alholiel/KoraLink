'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetcher, clearAuthToken } from '@/lib/fetcher';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { identifyUser, clearUser } from '@/providers/ObservabilityProvider';
import type { UserProfileApi } from '@/hooks/useUser';

/**
 * One probe per browser session for persisted users. A persisted Zustand user
 * may be stale (JWT expired, account banned) — if we never verify it, the
 * whole shell renders error states forever. The sessionStorage flag makes the
 * probe run once per tab session (success keeps it set for the session; a
 * failed probe clears auth, so a fresh session starts clean).
 */
const BOOTSTRAP_FLAG = 'koralink_bootstrap_run';

/**
 * No-UI component that populates Zustand auth state on cold page loads.
 *
 * Runs once on mount. If Zustand `user` is null and hydration is complete,
 * calls GET /users/me and populates the store via login().
 *
 * Also identifies the user in Sentry + PostHog for session correlation.
 *
 * Renders nothing — purely a side-effect component.
 */
export default function AuthBootstrap() {
  const user = useAppStore(selectUser);
  const isHydrated = useAppStore((s) => s.isHydrated);
  const login = useAppStore((s) => s.login);

  // Sync user identity to observability providers
  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id, {
        full_name: user.fullName,
        handle: user.handle,
      });
    } else {
      clearUser();
    }
  }, [user?.id, user?.fullName, user?.handle]);

  useQuery({
    queryKey: ['auth', 'bootstrap'],
    queryFn: async () => {
      try {
        const profile = await fetcher<UserProfileApi>('/users/me');
        const skillLevel = (
          profile.skill_level?.toLowerCase() ?? 'intermediate'
        ) as 'beginner' | 'intermediate' | 'advanced';
        login(
          {
            id: profile.id,
            fullName: profile.full_name ?? '',
            handle: profile.handle ?? '',
            avatarUrl: profile.avatar_url ?? '',
            phone: profile.phone,
            preferredLocation: profile.preferred_location ?? '',
            preferredPosition: profile.preferred_position ?? '',
            skillLevel,
            locale: 'en',
          },
          '', // No new token — cookie already valid
        );
        // Verified this session — don't re-probe on in-app navigation remounts.
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(BOOTSTRAP_FLAG, '1');
        }
        return profile;
      } catch {
        // Probe failed with a persisted user → auth is stale (401 expired /
        // banned, 404 deleted). Clear the local token + store (the fetcher's
        // global 401 handler already redirected to /login for the 401 case;
        // this catch covers 403/404 and non-window contexts).
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(BOOTSTRAP_FLAG);
          clearAuthToken();
        }
        useAppStore.getState().logout();
        return null;
      }
    },
    // Bootstrap whenever we might have a session: a stored Bearer token OR the
    // HttpOnly cookie set by the real OTP flow (which never writes localStorage).
    //
    // Stale-user self-heal (P2-17, run #10): previously skipped entirely when a
    // persisted user existed (`!user` short-circuit) — an expired JWT or banned
    // account left the shell authed-looking but 401ing on every query. Now a
    // persisted user gets exactly ONE /users/me probe per browser session; a
    // failure logs them out cleanly instead of trapping them in error states.
    enabled:
      isHydrated &&
      typeof window !== 'undefined' &&
      (!user || !sessionStorage.getItem(BOOTSTRAP_FLAG)),
    staleTime: 60_000,
    retry: false, // Do not retry 401 — user is unauthenticated
  });

  return null;
}
