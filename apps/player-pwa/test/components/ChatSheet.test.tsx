import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

// Mock socket.io-client before importing the component
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    close: vi.fn(),
  })),
}));

// Mock useMatchChat hook from useMessages (NOT useMatches)
const mockUseMatchChat = vi.fn();
vi.mock('@/hooks/useMessages', () => ({
  useMatchChat: (...args: unknown[]) => mockUseMatchChat(...args),
  type: { MatchMessage: {} },
}));

// Mock useAppStore (ChatSheet reads current user for message authorship)
vi.mock('@/store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({ id: 'user-1', full_name: 'Test User' })),
  selectUser: () => ({ id: 'user-1', full_name: 'Test User' }),
}));

import ChatSheet from '@/components/matches/ChatSheet';

// Wrapper with QueryClientProvider + i18n
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  matchId: 'test-match-id',
  matchTitle: 'Friday Night 5v5',
};

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function mockReturn(value: Partial<Record<string, unknown>>) {
  mockUseMatchChat.mockReturnValue({
    messages: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isConnected: false,
    sendMessage: vi.fn(),
    ...value,
  });
}

describe('ChatSheet', () => {
  it('CS-1: renders loading spinner when messages are loading', () => {
    mockReturn({ isLoading: true, messages: [] });

    renderWithProviders(<ChatSheet {...baseProps} />);

    // Spinner should be visible
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();

    // Empty state should NOT be visible
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('CS-2: renders empty state when API returns empty array', () => {
    mockReturn({ messages: [], isLoading: false });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(screen.getByText('No messages yet')).toBeTruthy();
    expect(screen.getByText('Start the conversation!')).toBeTruthy();
  });

  it('CS-3: renders message list when API returns messages', () => {
    mockReturn({
      messages: [
        {
          id: 'msg-1',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'Great game everyone!',
          created_at: '2026-08-15T19:30:00.000Z',
          user: { id: 'user-1', full_name: 'Ahmed', handle: '@ahmed', avatar_url: null },
        },
        {
          id: 'msg-2',
          match_id: 'test-match-id',
          user_id: 'user-2',
          content: 'See you at 8pm',
          created_at: '2026-08-15T19:31:00.000Z',
          user: { id: 'user-2', full_name: 'Khalid', handle: '@khalid', avatar_url: null },
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(screen.getByText('Great game everyone!')).toBeTruthy();
    expect(screen.getByText('See you at 8pm')).toBeTruthy();
    expect(screen.getByText('Khalid')).toBeTruthy();

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeNull();
  });

  it('CS-4: does not render when isOpen=false', () => {
    mockReturn({ messages: [], isLoading: false });

    renderWithProviders(<ChatSheet {...baseProps} isOpen={false} />);

    expect(screen.queryByText('Friday Night 5v5')).toBeNull();
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('CS-5: calls onClose when backdrop (overlay) is clicked', () => {
    mockReturn({ messages: [], isLoading: false });
    const onClose = vi.fn();

    renderWithProviders(<ChatSheet {...baseProps} onClose={onClose} />);

    const overlay = document.querySelector('.bg-black\\/50');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('CS-6: shows error state with retry button on API failure', () => {
    const mockRefetch = vi.fn();
    mockReturn({
      messages: [],
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(screen.getByText("Couldn't load data. Check your connection.")).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();

    fireEvent.click(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
