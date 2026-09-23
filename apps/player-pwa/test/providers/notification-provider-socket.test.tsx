import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import NotificationProvider from '@/providers/NotificationProvider';
import { createLobbySocket } from '@/lib/socket';
import { useAppStore } from '@/store/useAppStore';

/**
 * F3 regression (2026-09-22): the app-wide notification socket must be a
 * session singleton. The old effect listed `pathname` in its deps, so EVERY
 * route change disconnected + re-handshaked (JWT verify + users-row SELECT)
 * and dropped notification events mid-navigation.
 */
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/en/play'),
}));

vi.mock('@/lib/socket', () => ({
  createLobbySocket: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { usePathname } from 'next/navigation';
const pathMock = vi.mocked(usePathname);

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('NotificationProvider — socket lifetime (F3)', () => {
  beforeEach(() => {
    vi.mocked(createLobbySocket).mockClear();
    pathMock.mockReturnValue('/en/play');
    useAppStore.setState({
      isAuthenticated: true,
      user: {
        id: 'user-me',
        fullName: 'Me',
        handle: 'me',
        avatarUrl: '',
        phone: '+966****0001',
      } as never,
    });
  });

  it('creates exactly ONE socket across navigation (pathname never re-subscribes)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <NotificationProvider>
        <div />
      </NotificationProvider>,
      { wrapper: wrapper(queryClient) },
    );
    expect(createLobbySocket).toHaveBeenCalledTimes(1);

    // Simulate navigating: feed → messages thread → match detail.
    pathMock.mockReturnValue('/en/messages/conv-1');
    rerender(
      <NotificationProvider>
        <div />
      </NotificationProvider>,
    );
    pathMock.mockReturnValue('/en/match/m-9');
    rerender(
      <NotificationProvider>
        <div />
      </NotificationProvider>,
    );

    // The regression would see 3. One connection is the contract.
    expect(createLobbySocket).toHaveBeenCalledTimes(1);
  });
});
