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

// Mock the hydration-safe clock — ChatSheet must thread it into groupMessages
// (P2-59, run #50) instead of reading new Date() in the render path.
const mockUseNow = vi.fn<() => number | null>(() => 1_000_000_000);
vi.mock('@/hooks/useNow', () => ({
  useNow: () => mockUseNow(),
}));

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
    sendMessage: { mutate: vi.fn(), isPending: false, isError: false },
    retryMessage: vi.fn(),
    // P2-99 (run #74): typing surface consumed by ChatSheet.
    typingUserIds: new Set<string>(),
    emitTyping: vi.fn(),
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

  it('CS-3b: buckets messages with the useNow clock — today/yesterday groups use nowMs, not new Date() (P2-59)', () => {
    // Deliberately NOT the real wall clock — proves grouping follows useNow().
    const nowMs = 1_700_000_000_000; // 2023-11-14T22:13:20Z
    mockUseNow.mockReturnValue(nowMs);
    const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
    const older = '2020-01-01T10:00:00.000Z';

    mockReturn({
      messages: [
        {
          id: 'msg-today',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'fresh message',
          created_at: new Date(nowMs - 60_000).toISOString(),
          user: { id: 'user-1', full_name: 'Ahmed', handle: '@ahmed', avatar_url: null },
        },
        {
          id: 'msg-yesterday',
          match_id: 'test-match-id',
          user_id: 'user-2',
          content: 'yesterday message',
          created_at: yesterday,
          user: { id: 'user-2', full_name: 'Khalid', handle: '@khalid', avatar_url: null },
        },
        {
          id: 'msg-older',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'ancient message',
          created_at: older,
          user: { id: 'user-1', full_name: 'Ahmed', handle: '@ahmed', avatar_url: null },
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    // The 2020 message renders under a plain localized date, not "Today".
    expect(screen.getByText('Jan 1')).toBeTruthy();
  });

  it('CS-3c: null clock (SSR/first-render posture) does not crash and recovers to real-clock labels (P2-59)', () => {
    mockUseNow.mockReturnValue(null); // SSR + first client render posture
    mockReturn({
      messages: [
        {
          id: 'msg-now',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'sent seconds ago',
          created_at: new Date(Date.now()).toISOString(),
          user: { id: 'user-1', full_name: 'Ahmed', handle: '@ahmed', avatar_url: null },
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    // Effects flush synchronously in RTL, so the post-mount render shows the
    // real-clock bucket; the assertion here is that the null posture never
    // crashes and the message survives. (The hydration contract itself —
    // grouping driven by useNow, not the wall clock — is pinned by CS-3b,
    // and useNow's null-then-real sequence by OfflineBanner.test.tsx.)
    expect(screen.getByText('sent seconds ago')).toBeTruthy();
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

  it('CS-6: shows CLASSIFIED error copy + retry on API failure (P2-63)', () => {
    const mockRefetch = vi.fn();
    // Plain Error (no status, non-network message) → classifyError → 'unknown'.
    mockReturn({
      messages: [],
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(
      screen.getByText("That didn't work. Try again — if it keeps failing, check your connection."),
    ).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();

    fireEvent.click(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('CS-6b: 5xx failures show the server-class copy (P2-63 — errors.server, not generic)', () => {
    mockReturn({
      messages: [],
      isLoading: false,
      error: Object.assign(new Error('Internal server error'), { status: 503 }),
      refetch: vi.fn(),
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    expect(
      screen.getByText('Our servers hit a snag — your data is safe. Try again in a moment.'),
    ).toBeTruthy();
  });

  it('CS-7: clears the input and sends with a clientMessageId on send', () => {
    const mutate = vi.fn();
    mockReturn({
      isConnected: true,
      sendMessage: { mutate, isPending: false, isError: false },
      retryMessage: vi.fn(),
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello team' } });
    fireEvent.click(screen.getByLabelText('Send'));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ content: 'hello team' });
    expect(mutate.mock.calls[0][0].clientMessageId).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('CS-8: renders a failed status and retries with the same clientMessageId', () => {
    const retryMessage = vi.fn();
    mockReturn({
      isConnected: true,
      messages: [
        {
          id: 'local-abc',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'stuck message',
          created_at: new Date().toISOString(),
          user: { id: 'user-1', full_name: 'Test User', handle: null, avatar_url: null },
          client_message_id: 'abc',
          status: 'failed',
        },
      ],
      sendMessage: { mutate: vi.fn(), isPending: false, isError: false },
      retryMessage,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    const retryButton = screen.getByLabelText('Not sent — Tap to retry');
    fireEvent.click(retryButton);

    expect(retryMessage).toHaveBeenCalledTimes(1);
    expect(retryMessage).toHaveBeenCalledWith('abc', 'stuck message');
  });

  it('CS-9: received messages carry a report button; own messages do NOT (P1-31 parity)', () => {
    mockReturn({
      messages: [
        {
          id: 'msg-mine',
          match_id: 'test-match-id',
          user_id: 'user-1',
          content: 'my own message',
          created_at: new Date().toISOString(),
          user: { id: 'user-1', full_name: 'Ahmed', handle: null, avatar_url: null },
        },
        {
          id: 'msg-theirs',
          match_id: 'test-match-id',
          user_id: 'user-2',
          content: 'message from someone else',
          created_at: new Date().toISOString(),
          user: { id: 'user-2', full_name: 'Khalid', handle: null, avatar_url: null },
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    // Exactly one report affordance — on the received message only.
    // Label = report.chatMessage ("Lobby message"), the lobby-specific key.
    const reportButtons = screen.getAllByLabelText('Lobby message');
    expect(reportButtons).toHaveLength(1);
  });

  it('CS-10: tapping report opens the ReportSheet for that message (P1-31 parity)', async () => {
    mockReturn({
      messages: [
        {
          id: 'msg-theirs-2',
          match_id: 'test-match-id',
          user_id: 'user-2',
          content: 'abusive message',
          created_at: new Date().toISOString(),
          user: { id: 'user-2', full_name: 'Khalid', handle: null, avatar_url: null },
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<ChatSheet {...baseProps} />);

    fireEvent.click(screen.getByLabelText('Lobby message'));

    // The report sheet mounts with the lobby-specific subject label + title.
    const dialogTitle = await screen.findByText('Report this message');
    expect(dialogTitle).toBeTruthy();
    expect(screen.getByText('Lobby message')).toBeTruthy();
  });
});
