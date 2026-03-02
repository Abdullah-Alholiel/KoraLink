import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'ADMIN' | 'VENUE_OWNER';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** Only present for VENUE_OWNER accounts. */
  venueId?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

/**
 * Global authentication state for the KoraLink Admin Portal.
 *
 * Persists the user object to sessionStorage so that page refreshes within
 * the same browser tab don't flash an unauthenticated state. The server-side
 * middleware (src/middleware.ts) is the authoritative guard — this store is
 * for UI convenience only (e.g. showing the user's name in the sidebar).
 *
 * NOTE: Never store sensitive data (tokens, passwords) here — the actual
 * HttpOnly access_token cookie is managed by the NestJS backend.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      logout: () => {
        set({ user: null, isLoading: false });
        // Attempt to clear the HttpOnly cookie on the backend.
        // If this fails (network error, server down), the cookie may remain
        // valid until it expires — the middleware JWT verification will still
        // reject it once it expires. Log failures for observability.
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch((err: unknown) => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[AuthStore] Logout request failed:', err);
          }
        });
      },
    }),
    {
      name: 'koralink-admin-auth',
      // Only persist the user object — isLoading is ephemeral UI state.
      partialize: (state) => ({ user: state.user }),
      // Use sessionStorage so credentials are cleared when the tab is closed.
      storage:
        typeof window !== 'undefined'
          ? {
              getItem: (key) => {
                const item = sessionStorage.getItem(key);
                return item ? JSON.parse(item) : null;
              },
              setItem: (key, value) =>
                sessionStorage.setItem(key, JSON.stringify(value)),
              removeItem: (key) => sessionStorage.removeItem(key),
            }
          : undefined,
    }
  )
);
