import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock fetcher
const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {
    status: number;
    url: string;
    constructor(msg: string, status: number, url: string) {
      super(msg);
      this.name = 'FetchError';
      this.status = status;
      this.url = url;
    }
  },
}));

// Mock zustand store
const storeState: Record<string, unknown> = {
  user: null,
  token: null,
  isAuthenticated: false,
  isOnboarded: false,
  updateUser: vi.fn(),
  setOnboarded: vi.fn(),
};

vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    if (selector) return selector(storeState);
    return storeState;
  },
}));

import { useSendOtp, useVerifyOtp, useCompleteProfile } from '@/hooks/useAuth';

// Wrapper with QueryClientProvider (required for useMutation)
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useAuth hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    storeState.user = null;
    storeState.token = null;
    storeState.isAuthenticated = false;
    storeState.isOnboarded = false;
  });

  describe('useSendOtp', () => {
    it('calls fetcher with POST /auth/send-otp', async () => {
      mockFetcher.mockResolvedValue({ message: 'OTP sent.' });
      const { result } = renderHook(() => useSendOtp(), { wrapper: wrapper as never });

      await act(async () => {
        await result.current.mutateAsync({ phone: '512345678' });
      });

      expect(mockFetcher).toHaveBeenCalledWith('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: '+966512345678' }),
      });
    });
  });

  describe('useVerifyOtp', () => {
    it('calls fetcher with POST /auth/verify-otp', async () => {
      mockFetcher.mockResolvedValue({ isNewUser: true });
      const { result } = renderHook(() => useVerifyOtp(), { wrapper: wrapper as never });

      await act(async () => {
        await result.current.mutateAsync({ phone: '512345678', otp: '123456' });
      });

      expect(mockFetcher).toHaveBeenCalledWith('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: '+966512345678', code: '123456', surface: 'player' }),
      });
    });

    it('returns isNewUser from API response', async () => {
      mockFetcher.mockResolvedValue({ isNewUser: false });
      const { result } = renderHook(() => useVerifyOtp(), { wrapper: wrapper as never });

      let data: { isNewUser: boolean } | undefined;
      await act(async () => {
        data = await result.current.mutateAsync({ phone: '512345678', otp: '123456' });
      });

      expect(data?.isNewUser).toBe(false);
    });
  });

  describe('useCompleteProfile', () => {
    it('maps camelCase input to snake_case API payload', async () => {
      mockFetcher.mockResolvedValue({
        id: 'u1',
        phone: '+966512345678',
        full_name: 'Ahmed Al-Rashid',
        handle: 'ahmed_al-rashid',
        avatar_url: null,
        skill_level: 'Intermediate',
        preferred_location: 'Riyadh',
        preferred_position: 'Forward',
        role: 'Player',
      });
      const mockSetOnboarded = storeState.setOnboarded as ReturnType<typeof vi.fn>;

      const { result } = renderHook(() => useCompleteProfile(), { wrapper: wrapper as never });

      await act(async () => {
        await result.current.mutateAsync({
          fullName: 'Ahmed Al-Rashid',
          preferredLocation: 'Riyadh',
          preferredPosition: 'Forward',
          skillLevel: 'Intermediate',
        });
      });

      expect(mockFetcher).toHaveBeenCalledWith('/auth/complete-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: 'Ahmed Al-Rashid',
          handle: 'ahmed_al-rashid',
          skill_level: 'Intermediate',
          preferred_location: 'Riyadh',
          preferred_position: 'Forward',
        }),
      });
      expect(mockSetOnboarded).toHaveBeenCalledWith(true);
    });
  });
});
