import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import RescheduleSheet from '@/components/matches/RescheduleSheet';
import { usePitchSlots, type PitchSlotApi } from '@/hooks/usePitchSlots';

// Mock the slots hook — the sheet is a pure consumer of its 5 states.
vi.mock('@/hooks/usePitchSlots', () => ({
  usePitchSlots: vi.fn(),
}));

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const SLOT_A: PitchSlotApi = {
  id: 'slot-a',
  pitch_id: 'pitch-1',
  slot_date: '2026-08-30',
  start_time: '18:00:00',
  end_time: '19:00:00',
  is_booked: false,
  booked_match_id: null,
};
const SLOT_B: PitchSlotApi = { ...SLOT_A, id: 'slot-b', start_time: '20:00:00', end_time: '21:00:00' };
const SLOT_TAKEN: PitchSlotApi = { ...SLOT_A, id: 'slot-taken', is_booked: true };
const SLOT_CURRENT: PitchSlotApi = { ...SLOT_A, id: 'slot-current' };

function renderSheet(props: Partial<Parameters<typeof RescheduleSheet>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <RescheduleSheet
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          currentSlotId="slot-current"
          pitchId="pitch-1"
          matchTitle="Friday football"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('RescheduleSheet — host reschedule (P1-13)', () => {
  beforeEach(() => {
    vi.mocked(usePitchSlots).mockReset();
  });

  it('shows the title and loading skeleton while slots are fetching', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    expect(screen.getByText('Reschedule Match')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('lists only FREE slots and excludes the match current slot', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B, SLOT_TAKEN, SLOT_CURRENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    expect(screen.getByText('8:00 PM')).toBeInTheDocument();
    expect(screen.queryByText('slot-taken')).not.toBeInTheDocument();
    expect(screen.queryByText('slot-current')).not.toBeInTheDocument();
  });

  it('shows the empty state when no free slots remain', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_TAKEN, SLOT_CURRENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    expect(
      screen.getByText('No free slots left on this pitch today. Try again tomorrow.'),
    ).toBeInTheDocument();
  });

  it('shows the error state with retry (5 UX states)', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    renderSheet();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('disables confirm until a slot is picked, then fires onConfirm with it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet({ onConfirm });

    const confirm = screen.getByRole('button', { name: /move match/i });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText('8:00 PM'));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(SLOT_B);
  });
});
