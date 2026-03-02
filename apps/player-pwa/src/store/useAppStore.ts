import { create } from 'zustand';
import { persist, devtools, createJSONStorage } from 'zustand/middleware';
import {
  createAuthSlice,
  createMatchSlice,
  createWalletSlice,
  createUISlice,
  type AuthSlice,
  type MatchSlice,
  type WalletSlice,
  type UISlice,
} from './slices';

// ─── Preferences (migrated from old store) ──────────

export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark' | 'system';

interface PreferencesSlice {
  preferences: {
    locale: Locale;
    theme: Theme;
    notificationsEnabled: boolean;
  };
  isHydrated: boolean;

  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

// ─── Composed Store ─────────────────────────────────

type AppStore = PreferencesSlice & AuthSlice & MatchSlice & WalletSlice & UISlice;

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set) => ({
        // ── Preferences ──
        preferences: {
          locale: 'ar',
          theme: 'system' as Theme,
          notificationsEnabled: true,
        },
        isHydrated: false,

        setLocale: (locale) =>
          set(
            (state) => ({ preferences: { ...state.preferences, locale } }),
            false,
            'preferences/setLocale'
          ),
        setTheme: (theme) =>
          set(
            (state) => ({ preferences: { ...state.preferences, theme } }),
            false,
            'preferences/setTheme'
          ),
        setNotificationsEnabled: (notificationsEnabled) =>
          set(
            (state) => ({
              preferences: { ...state.preferences, notificationsEnabled },
            }),
            false,
            'preferences/setNotifications'
          ),
        setHydrated: (isHydrated) =>
          set({ isHydrated } as Partial<AppStore>, false, 'hydrated'),

        // ── Domain Slices ──
        ...createAuthSlice(
          (fn) => set((state) => fn(state) as Partial<AppStore>, false, 'auth')
        ),
        ...createMatchSlice(
          (fn) => set((state) => fn(state as unknown as MatchSlice) as Partial<AppStore>, false, 'match')
        ),
        ...createWalletSlice(
          (fn) => set((state) => fn(state as unknown as WalletSlice) as Partial<AppStore>, false, 'wallet')
        ),
        ...createUISlice(
          (fn) => set((state) => fn(state as unknown as UISlice) as Partial<AppStore>, false, 'ui')
        ),
      }),
      {
        name: 'koralink-app-store',
        storage: createJSONStorage(() => localStorage),
        // Only persist client state — NOT server state (matches, transactions)
        partialize: (state) => ({
          preferences: state.preferences,
          token: state.token,
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          isOnboarded: state.isOnboarded,
          bookedMatchIds: state.bookedMatchIds,
          balance: state.balance,
          paymentMethods: state.paymentMethods,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
        },
      }
    ),
    { name: 'KoraLink Store', enabled: process.env.NODE_ENV === 'development' }
  )
);

// ─── Typed Selectors (prevent unnecessary re-renders) ──

export const selectLocale = (s: AppStore) => s.preferences.locale;
export const selectTheme = (s: AppStore) => s.preferences.theme;
export const selectUser = (s: AppStore) => s.user;
export const selectIsAuth = (s: AppStore) => s.isAuthenticated;
export const selectFilters = (s: AppStore) => s.filters;
export const selectBalance = (s: AppStore) => s.balance;
export const selectIsLoading = (s: AppStore) => s.isLoading;
export const selectToast = (s: AppStore) => s.toast;
export const selectBookedIds = (s: AppStore) => s.bookedMatchIds;
