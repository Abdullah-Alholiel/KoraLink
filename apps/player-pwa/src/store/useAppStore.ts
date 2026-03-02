import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark' | 'system';

interface UserPreferences {
  locale: Locale;
  theme: Theme;
  notificationsEnabled: boolean;
}

interface AppState {
  preferences: UserPreferences;
  isHydrated: boolean;

  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      preferences: {
        locale: 'ar',
        theme: 'system',
        notificationsEnabled: true,
      },
      isHydrated: false,

      setLocale: (locale) =>
        set((state) => ({ preferences: { ...state.preferences, locale } })),

      setTheme: (theme) =>
        set((state) => ({ preferences: { ...state.preferences, theme } })),

      setNotificationsEnabled: (notificationsEnabled) =>
        set((state) => ({
          preferences: { ...state.preferences, notificationsEnabled },
        })),

      setHydrated: (isHydrated) => set({ isHydrated }),
    }),
    {
      name: 'koralink-app-store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
