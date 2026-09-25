import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import NotificationProvider from '@/providers/NotificationProvider';
import { getRealtime } from '@/lib/realtime';
import { useAppStore } from '@/store/useAppStore';

/**
 * F3 regression (2026-09-22): the app-wide notification socket must be a
 * session singleton. The old effect listed `pathname` in its deps, so EVERY
 * route change disconnected + re-handshaked (JWT verify + users-row SELECT)
 * and dropped notification events mid-navigation.
 *
 * Slice 2: the provider now attaches to the shared RealtimeClient, so the
 * regression asserts on TRANSPORT CREATIONS (socket factory invocations) —
 * navigation must never create a new one.
 */
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/en/play'),
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
  let creations: number;

  beforeEach(() => {
    creations = 0;
    const rt = getRealtime();
    rt.teardown();
    rt.setSocketFactory(() => {
      creations += 1;
      return {
        on: vi.fn(),
        onAny: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as never;
    });
    pathMock.mockReturnValue('/en/play');
    useAppStore.setState({
      isAuthenticated: true,
      user: {
        id: 'user-me',
        fullName: 'Me',
        handle: 'me',
        avatarUrl: '',
        phone: '+9665' + '0'.repeat(7) + '1',
      } as never,
    });
  });

  it('creates exactly ONE transport across navigation (pathname never re-subscribes)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender, unmount } = render(
      <NotificationProvider>
        <div />
      </NotificationProvider>,
      { wrapper: wrapper(queryClient) },
    );
    expect(creations).toBe(1);

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
    expect(creations).toBe(1);
    unmount();
  });
});
