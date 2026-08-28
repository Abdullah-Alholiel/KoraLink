import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks (component composes fetcher + store + observability) ──────────

let usersMeResult: () => Promise<unknown> = async () => {
  throw Object.assign(new Error('Unauthorized'), { status: 401 });
};
vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(() => usersMeResult()),
  clearAuthToken: vi.fn(),
}));

const loginSpy = vi.fn();
const logoutSpy = vi.fn();
let mockUser: Record<string, unknown> | null = null;
vi.mock('@/store/useAppStore', () => ({
  useAppStore: Object.assign(
    vi.fn((selector: (s: unknown) => unknown) =>
      selector({ user: mockUser, isHydrated: true, login: loginSpy }),
    ),
    { getState: () => ({ logout: logoutSpy }) },
  ),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  identifyUser: vi.fn(),
  clearUser: vi.fn(),
}));

import AuthBootstrap from '@/components/auth/AuthBootstrap';

function renderBootstrap() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
    </QueryClientProvider>,
  );
}

describe('AuthBootstrap stale-user self-heal (P2-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUser = null;
    // Default: no session at all → probe 401s.
    usersMeResult = async () => {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    };
  });

  it('renders nothing (pure side-effect component)', () => {
    renderBootstrap();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stale persisted user + 401 probe → logs the user out (self-heal)', async () => {
    mockUser = { id: 'u1', fullName: 'Old Session' };
    renderBootstrap();

    await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
  });

  it('fresh cold load (no user) + valid /users/me → logs the user in', async () => {
    usersMeResult = async () => ({
      id: 'u2',
      full_name: 'Fresh User',
      handle: 'fresh',
      skill_level: 'advanced',
    });
    renderBootstrap();

    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u2', fullName: 'Fresh User' }),
        '',
      ),
    );
  });

  it('session flag: verified user is NOT re-probed on remount (same session)', async () => {
    mockUser = { id: 'u1', fullName: 'Verified' };
    sessionStorage.setItem('koralink_bootstrap_run', '1');
    usersMeResult = async () => {
      throw new Error('must not be called');
    };
    renderBootstrap();

    // Give any accidental query a tick to misfire, then assert it didn't.
    await new Promise((r) => setTimeout(r, 25));
    const { fetcher } = await import('@/lib/fetcher');
    expect(vi.mocked(fetcher)).not.toHaveBeenCalled();
  });

  it('failed probe clears the session flag (fresh session can start clean)', async () => {
    mockUser = { id: 'u1', fullName: 'Stale' };
    renderBootstrap();

    await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(sessionStorage.getItem('koralink_bootstrap_run')).toBeNull(),
    );
  });
});
