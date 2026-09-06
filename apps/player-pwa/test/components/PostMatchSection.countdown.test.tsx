import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { PomResult } from '@/hooks/usePom';

// The component opens a lobby socket on mount — never dial for real.
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('@/env.mjs', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://100.93.99.24:3001/api/v1' },
}));

// Minimal i18n mock that interpolates {time} so assertions can target the
// countdown text deterministically (key:value form).
vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>) =>
      values && 'time' in values ? `${key}:${values.time}` : key,
  useLocale: () => 'en',
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureError: vi.fn(),
}));

// Controllable POTM payload — each test pins its own voting state.
let pomResult: PomResult = { status: 'not_completed' };
vi.mock('@/hooks/usePom', () => ({
  usePomResult: () => ({ data: pomResult, isLoading: false }),
  useVote: () => ({ isPending: false, mutate: vi.fn() }),
}));

import PostMatchSection from '@/components/matches/PostMatchSection';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

// Fixed clock: every test derives votingClosesAt from this instant.
const NOW = new Date('2026-09-06T12:00:00Z');

function votingOpenResult(closesAt: Date): PomResult {
  return {
    status: 'voting_open',
    completedAt: new Date('2026-09-06T10:00:00Z').toISOString(),
    votingClosesAt: closesAt.toISOString(),
    hasVoted: false,
    votedFor: null,
    totalEligibleVoters: 14,
    votedCount: 6,
    candidates: [],
  };
}

function renderSection() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PostMatchSection matchId="m1" currentUserId="u1" />
    </QueryClientProvider>,
  );
}

describe('PostMatchSection POTM voting countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "Ends in" with the per-match time remaining', () => {
    pomResult = votingOpenResult(new Date(NOW.getTime() + 5.5 * 60 * 60 * 1000));
    renderSection();

    // 5h30m remaining → localized chunk rendered from votingClosesAt
    expect(screen.getByText('votingEndsIn:5h 30m')).toBeInTheDocument();
    // Voting UI is still active
    expect(screen.getByText('votePrompt')).toBeInTheDocument();
  });

  it('turns the badge red when under one hour remains', () => {
    pomResult = votingOpenResult(new Date(NOW.getTime() + 45 * 60 * 1000));
    renderSection();

    const badge = screen.getByText('votingEndsIn:45m');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-brand-red');
  });

  it('keeps the badge neutral when more than an hour remains', () => {
    pomResult = votingOpenResult(new Date(NOW.getTime() + 5.5 * 60 * 60 * 1000));
    renderSection();

    const badge = screen.getByText('votingEndsIn:5h 30m');
    expect(badge.className).not.toContain('text-brand-red');
  });

  it('flips to the ended card once the voting window passes', () => {
    pomResult = votingOpenResult(new Date(NOW.getTime() - 60 * 1000));
    renderSection();

    expect(screen.getByText('votingClosed')).toBeInTheDocument();
    // No vote CTA / countdown once the window is over
    expect(screen.queryByText('votePrompt')).not.toBeInTheDocument();
    expect(screen.queryByText(/votingEndsIn:/)).not.toBeInTheDocument();
  });
});
