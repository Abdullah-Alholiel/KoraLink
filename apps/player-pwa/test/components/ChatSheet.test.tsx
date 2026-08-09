import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatSheet from '@/components/matches/ChatSheet';

// Mock useMatchMessages hook
const mockUseMatchMessages = vi.fn();
vi.mock('@/hooks/useMatches', () => ({
  useMatchMessages: (...args: unknown[]) => mockUseMatchMessages(...args),
  useMatch: vi.fn(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      'common.errorDescription': 'Something went wrong',
      'common.retry': 'Try Again',
      'chatSheet.emptyTitle': 'No messages yet',
      'chatSheet.emptyDescription': 'Start the conversation!',
      'chatSheet.sendPlaceholder': 'Type a message...',
      'chatSheet.comingSoon': 'Chat coming soon',
    };
    return t[key] ?? key;
  },
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  matchId: 'test-match-id',
  matchTitle: 'Friday Night 5v5',
};

beforeEach(() => {
  vi.clearAllMocks();
});

function mockReturn(value: Partial<ReturnType<typeof mockUseMatchMessages>>) {
  mockUseMatchMessages.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...value,
  });
}

describe('ChatSheet', () => {
  it('CS-1: renders loading spinner when messages are loading', () => {
    mockReturn({ isLoading: true, data: undefined });

    render(<ChatSheet {...baseProps} />);

    // Spinner should be visible
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();

    // Empty state should NOT be visible
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('CS-2: renders empty state when API returns empty array', () => {
    mockReturn({ data: [], isLoading: false });

    render(<ChatSheet {...baseProps} />);

    expect(screen.getByText('No messages yet')).toBeTruthy();
    expect(screen.getByText('Start the conversation!')).toBeTruthy();
  });

  it('CS-3: renders message list when API returns messages', () => {
    mockReturn({
      data: [
        {
          id: 'msg-1',
          content: 'Great game everyone!',
          created_at: '2026-08-15T19:30:00.000Z',
          user: { id: 'user-1', full_name: 'Ahmed', avatar_url: null },
        },
        {
          id: 'msg-2',
          content: 'See you at 8pm',
          created_at: '2026-08-15T19:31:00.000Z',
          user: { id: 'user-2', full_name: 'Khalid', avatar_url: null },
        },
      ],
      isLoading: false,
    });

    render(<ChatSheet {...baseProps} />);

    expect(screen.getByText('Great game everyone!')).toBeTruthy();
    expect(screen.getByText('See you at 8pm')).toBeTruthy();
    expect(screen.getByText('Ahmed')).toBeTruthy();
    expect(screen.getByText('Khalid')).toBeTruthy();

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeNull();
  });

  it('CS-4: does not render when isOpen=false', () => {
    mockReturn({ data: [], isLoading: false });

    render(<ChatSheet {...baseProps} isOpen={false} />);

    expect(screen.queryByText('Friday Night 5v5')).toBeNull();
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('CS-5: calls onClose when backdrop (overlay) is clicked', () => {
    mockReturn({ data: [], isLoading: false });
    const onClose = vi.fn();

    render(<ChatSheet {...baseProps} onClose={onClose} />);

    const overlay = document.querySelector('.bg-black\\/50');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('CS-6: shows error state with retry button on API failure', () => {
    const mockRefetch = vi.fn();
    mockReturn({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    render(<ChatSheet {...baseProps} />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();

    fireEvent.click(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
