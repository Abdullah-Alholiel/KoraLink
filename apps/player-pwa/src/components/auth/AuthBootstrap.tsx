'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import { useAppStore, selectUser } from '@/store/useAppStore';
import type { UserProfileApi } from '@/hooks/useUser';

/**
 * No-UI component that populates Zustand auth state on cold page loads.
 *
 * Runs once on mount. If Zustand `user` is null and hydration is complete,
 * calls GET /users/me and populates the store via login().
 *
 * Renders nothing — purely a side-effect component.
 */
export default function AuthBootstrap() {
  const user = useAppStore(selectUser);
  const isHydrated = useAppStore((s) => s.isHydrated);
  const login = useAppStore((s) => s.login);

  useQuery({
    queryKey: ['auth', 'bootstrap'],
    queryFn: async () => {
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
      return profile;
    },
    enabled: isHydrated && !user, // Only when ready and user missing
    staleTime: 60_000,
    retry: false, // Do not retry 401 — user is unauthenticated
  });

  return null;
}
