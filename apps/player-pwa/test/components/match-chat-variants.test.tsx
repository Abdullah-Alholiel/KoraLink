import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

/**
 * P2-281 M-2 — the chat full-thread affordance.
 *
 * Contract: the sheet variant renders an "Open full thread" button wired to
 * onExpand; the page variant renders a back arrow, NOT an expand button.
 * Same mock family as ChatSheet.test.tsx (useMatchChat mocked wholesale).
 * The body/logic is shared — these tests pin the VARIANT DIVISION only.
 */

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

const mockUseMatchChat = vi.fn();
vi.mock('@/hooks/useMessages', () => ({
  useMatchChat: (...args: unknown[]) => mockUseMatchChat(...args),
  type: { MatchMessage: {} },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({ id: 'user-1', full_name: 'Test User' })),
  selectUser: () => ({ id: 'user-1', full_name: 'Test User' }),
}));

import MatchChat from '@/components/matches/MatchChat';

const mockUseNow = vi.fn<() => number | null>(() => 1_000_000_000);
vi.mock('@/hooks/useNow', () => ({
  useNow: () => mockUseNow(),
}));

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
  matchId: 'test-match-id',
  matchTitle: 'Friday Night 5v5',
};

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  mockUseMatchChat.mockReturnValue({
    messages: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isConnected: false,
    sendMessage: { mutate: vi.fn(), isPending: false, isError: false },
    retryMessage: vi.fn(),
    typingUserIds: new Set<string>(),
    emitTyping: vi.fn(),
  });
});

describe('MatchChat variants (P2-281 M-2)', () => {
  it('sheet variant renders the "Open full thread" affordance', () => {
    const onExpand = vi.fn();
    renderWithProviders(
      <MatchChat {...baseProps} variant="sheet" onRequestClose={vi.fn()} onExpand={onExpand} />,
    );
    const btn = screen.getByTestId('chat-expand');
    expect(btn.textContent).toContain('Open full thread');
  });

  it('page variant has NO expand button', () => {
    renderWithProviders(
      <MatchChat {...baseProps} variant="page" onRequestClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('chat-expand')).toBeNull();
  });

  it('ChatSheet wrapper carries the expand wiring (structure pin)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/components/matches/ChatSheet.tsx'),
      'utf-8',
    );
    expect(src).toContain('router.push(`/${locale}/match/${matchId}/chat`)');
    expect(src).toContain('onExpand={');
    expect(src).toContain('variant="sheet"');
  });
});
