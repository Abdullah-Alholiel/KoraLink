import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// socket.io-client must be mocked so we can assert the URL the client dials.
const ioMock = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return {
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
  },
}));

// Reproduce the production shape: a *pathful* base URL. createLobbySocket must
// strip `/api/v1` and dial `<origin>/lobby` — otherwise socket.io treats
// `/api/v1/lobby` as the namespace and the gateway rejects the handshake.
vi.mock('@/env.mjs', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://100.93.99.24:3001/api/v1' },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// Not under test here — stub the POTM data + vote hooks so the component renders
// a lightweight placeholder state while the socket effect still runs.
vi.mock('@/hooks/usePom', () => ({
  usePomResult: () => ({ data: { status: 'not_completed' }, isLoading: false }),
  useVote: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureError: vi.fn(),
}));

import PostMatchSection from '@/components/matches/PostMatchSection';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

describe('PostMatchSection realtime socket', () => {
  beforeEach(() => {
    ioMock.mockClear();
  });

  it('dials the /lobby namespace on the ORIGIN, not the pathful base (regression)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PostMatchSection matchId="m1" currentUserId="u1" />
      </QueryClientProvider>,
    );

    expect(ioMock).toHaveBeenCalledTimes(1);
    const url = ioMock.mock.calls[0][0] as string;
    expect(url).toBe('http://100.93.99.24:3001/lobby');
    expect(url).not.toContain('/api/v1');
  });
});
