import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

/** YYYY-MM-DD for (today) + N days — computed in LOCAL time, matching the
 * test environment (the sheet maps it through dateInRiyadh for the API). */
function isoDaysFromNow(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TODAY = isoDaysFromNow(0);
const SLOT_A: PitchSlotApi = {
  id: 'slot-a',
  pitch_id: 'pitch-1',
  slot_date: TODAY,
  start_time: '18:00:00',
  end_time: '19:00:00',
  is_booked: false,
  booked_match_id: null,
};
const SLOT_B: PitchSlotApi = { ...SLOT_A, id: 'slot-b', start_time: '20:00:00', end_time: '21:00:00' };
const SLOT_TAKEN: PitchSlotApi = { ...SLOT_A, id: 'slot-taken', is_booked: true };
const SLOT_CURRENT: PitchSlotApi = { ...SLOT_A, id: 'slot-current' };
const SLOT_TOMORROW: PitchSlotApi = {
  ...SLOT_A,
  id: 'slot-tomorrow',
  slot_date: isoDaysFromNow(1),
};

/** Extract the last usePitchSlots call's date arg (the day currently shown). */
function lastQueriedDate(): string | null {
  const calls = vi.mocked(usePitchSlots).mock.calls;
  return (calls[calls.length - 1]?.[1] as string | null) ?? null;
}

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

describe('RescheduleSheet — host reschedule (P1-13, cross-day run #21)', () => {
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

  it('queries TODAY by default and lists only FREE slots (current slot excluded)', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B, SLOT_TAKEN, SLOT_CURRENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    // Default day = today (Riyadh), unchanged from the run #20 behavior.
    expect(lastQueriedDate()).toBe(TODAY);
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    expect(screen.getByText('8:00 PM')).toBeInTheDocument();
    expect(screen.queryByText('slot-taken')).not.toBeInTheDocument();
    expect(screen.queryByText('slot-current')).not.toBeInTheDocument();
  });

  it('switches to ANOTHER DAY: picking +1 taps it, clears the slot pick, refetches that day', async () => {
    const user = userEvent.setup();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();

    // Day strip renders the 30-day window; tap the second chip (today+1).
    const strip = screen
      .getByText('Pick a day')
      .closest('div')!
      .parentElement!.querySelector('.scroll-container') as HTMLElement;
    const chips = within(strip).getAllByRole('button');
    expect(chips).toHaveLength(30);
    await user.click(chips[1]);
    expect(lastQueriedDate()).toBe(isoDaysFromNow(1));
  });

  it('marks TODAY with a dot and aria-current inside the strip', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    const dot = screen.getByTestId('today-dot');
    expect(dot).toBeInTheDocument();
    const todayChip = dot.closest('button')!;
    expect(todayChip).toHaveAttribute('aria-current', 'date');
    expect(todayChip).toHaveAttribute('aria-pressed', 'true'); // defaults to today
    expect(within(todayChip).getByText('TODAY')).toBeInTheDocument();
  });

  it('shows the empty state on a day with no free slots (day-aware wording)', () => {
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_TAKEN, SLOT_CURRENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();
    expect(
      screen.getByText('No free slots on the selected day. Try another day.'),
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

  it('fires onConfirm with the slot of the DAY it was picked on (cross-day pick survives)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    // First render pass: today has no slots; tomorrow has one.
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_TOMORROW],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet({ onConfirm });

    await user.click(screen.getByText('6:00 PM'));
    const confirm = screen.getByRole('button', { name: /move match/i });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(SLOT_TOMORROW);
    expect(SLOT_TOMORROW.slot_date).not.toBe(TODAY);
  });
});
