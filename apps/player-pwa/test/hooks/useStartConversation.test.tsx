import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStartConversation } from '@/hooks/useConversations';
import { fetcher, FetchError } from '@/lib/fetcher';

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const wrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

describe('useStartConversation — profile → DM entry (POST /conversations)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
  });

  it('POSTs the target userId and returns the conversation', async () => {
    vi.mocked(fetcher).mockResolvedValueOnce({
      id: 'conv-1',
      participants: [],
      created_at: new Date().toISOString(),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStartConversation(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate('user-target-36-char-id-xxxxxxxx');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetcher).toHaveBeenCalledWith(
      '/conversations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'user-target-36-char-id-xxxxxxxx' }),
      }),
    );
    expect(result.current.data?.id).toBe('conv-1');
  });

  it('surfaces FetchError on failure and recovers for a retry', async () => {
    vi.mocked(fetcher)
      .mockRejectedValueOnce(new FetchError('no network', 0, '/conversations'))
      .mockResolvedValueOnce({
        id: 'conv-2',
        participants: [],
        created_at: new Date().toISOString(),
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStartConversation(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate('user-target-36-char-id-xxxxxxxx');
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Retry succeeds — the button stays enabled in the UI off isPending.
    result.current.mutate('user-target-36-char-id-xxxxxxxx');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('conv-2');
  });
});
