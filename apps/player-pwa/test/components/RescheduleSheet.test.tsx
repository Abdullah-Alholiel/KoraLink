import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import RescheduleSheet from '@/components/matches/RescheduleSheet';
import { usePitchSlots, type PitchSlotApi } from '@/hooks/usePitchSlots';
import { riyadhDateKey } from '@/lib/venue-hours';

// Mock the slots hook — the sheet is a pure consumer of its 5 states.
vi.mock('@/hooks/usePitchSlots', () => ({
  usePitchSlots: vi.fn(),
  PITCH_SLOTS_BASE_KEY: 'pitch-slots',
  pitchSlotsQueryKey: (p: string | null, d: string | null) => [
    'pitch-slots', p, d,
  ],
}));

// The tap-revalidation hook (P2-234) reads the query client directly. Default
// state: a pre-existing read whose dataUpdateCount never advances across the
// hook's refetch attempt → "no fresh read landed" → taps are never accused.
// Individual tests override getQueryState to simulate a fresh read.
const { queryClientMock } = vi.hoisted(() => ({
  queryClientMock: {
    refetchQueries: vi.fn(),
    getQueryState: vi.fn(),
  },
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => queryClientMock,
  };
});

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

/** YYYY-MM-DD for (today) + N days — computed in RIYADH-local time, matching
 * what the sheet itself maps through dateInRiyadh for the API. The previous
 * local-TZ version disagreed with the component for 3h every day (21:00–24:00
 * UTC, when Riyadh has already rolled to tomorrow) — found live 2026-09-06
 * 21:3xZ when 3 fixtures failed the moment Riyadh hit Sep 7. Anchoring on the
 * component's own riyadhDateKey + Saudi's no-DST +N×24h is wall-clock-proof. */
function isoDaysFromNow(daysFromNow: number): string {
  const now = new Date();
  return riyadhDateKey(new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000));
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
    queryClientMock.refetchQueries.mockReset();
    queryClientMock.refetchQueries.mockResolvedValue(undefined);
    queryClientMock.getQueryState.mockReset();
    // Default: a read exists whose dataUpdateCount stays put → no fresh
    // read → tap-revalidation never accuses. state.data is irrelevant.
    queryClientMock.getQueryState.mockReturnValue({
      data: [], dataUpdateCount: 1,
    });
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
    expect(screen.getByText('6:00 pm')).toBeInTheDocument();
    expect(screen.getByText('8:00 pm')).toBeInTheDocument();
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

    // Day strip renders the 7-day window (P1-13 spec); tap the second chip (today+1).
    const strip = screen
      .getByText('Pick a day')
      .closest('div')!
      .parentElement!.querySelector('.scroll-container') as HTMLElement;
    const chips = within(strip).getAllByRole('button');
    expect(chips).toHaveLength(7);
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

    await user.click(screen.getByText('8:00 pm'));
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

    await user.click(screen.getByText('6:00 pm'));
    const confirm = screen.getByRole('button', { name: /move match/i });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(SLOT_TOMORROW);
    expect(SLOT_TOMORROW.slot_date).not.toBe(TODAY);
  });

  // ── P2-234: tap-time revalidation (run #152) ──

  it('P2-234: fresh read showing the tapped slot booked clears the pick, shows the alert, holds the CTA', async () => {
    const user = userEvent.setup();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B], // STALE snapshot — slots look free
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    // Simulate a real client: the fresh read LANDS (generation 0 → 1) and
    // shows SLOT_B booked from that generation onward.
    const client = { gen: 0 };
    queryClientMock.refetchQueries.mockImplementation(async () => {
      client.gen += 1;
      return undefined;
    });
    queryClientMock.getQueryState.mockImplementation(() => ({
      data: client.gen >= 1 ? [SLOT_A, { ...SLOT_B, is_booked: true }] : [],
      dataUpdateCount: client.gen,
    }));
    renderSheet();

    await user.click(screen.getByText('8:00 pm'));

    // The fresh read clears the pick (in prod the round-trip shows the
    // optimistic highlight briefly; with resolved mocks it is instant)…
    await screen.findByTestId('slot-taken-error');
    expect(screen.getByRole('button', { name: /8:00 pm/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This time slot was just booked by another host. Pick a different slot and try again.',
    );
    // The CTA stays held while the taken flag is up.
    expect(screen.getByRole('button', { name: /move match/i })).toBeDisabled();
  });

  it('P2-234: fresh read confirming the slot free keeps the pick and enables the CTA', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    // Fresh read LANDS (count 1 → 2) and still shows both slots free.
    queryClientMock.getQueryState
      .mockReturnValueOnce({ data: [], dataUpdateCount: 1 })
      .mockImplementation((queryKey) => {
        const key = queryKey as readonly unknown[];
        if (key[0] === 'pitch-slots') {
          return { data: [SLOT_A, SLOT_B], dataUpdateCount: 2 };
        }
        return undefined;
      });
    renderSheet({ onConfirm });

    await user.click(screen.getByText('8:00 pm'));
    await waitFor(() =>
      expect(queryClientMock.refetchQueries).toHaveBeenCalled(),
    );

    expect(
      screen.getByRole('button', { name: /8:00 pm/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('slot-taken-error')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /move match/i }),
    ).toBeEnabled();
  });

  it('P2-234: no fresh read landed (refetch failed) — pick stands, CTA usable', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    vi.mocked(usePitchSlots).mockReturnValue({
      data: [SLOT_A, SLOT_B],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    // dataUpdateCount stays at 1 — the refetch FAILED offline; no fresh read
    // ever lands, so the pick can be accused of nothing.
    queryClientMock.getQueryState.mockImplementation((queryKey) => {
      const key = queryKey as readonly unknown[];
      if (key[0] === 'pitch-slots') {
        return { data: [SLOT_A, SLOT_B], dataUpdateCount: 1 };
      }
      return undefined;
    });
    renderSheet({ onConfirm });

    await user.click(screen.getByText('8:00 pm'));
    await waitFor(() =>
      expect(queryClientMock.refetchQueries).toHaveBeenCalled(),
    );

    expect(
      screen.getByRole('button', { name: /8:00 pm/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('slot-taken-error')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /move match/i }),
    ).toBeEnabled();
  });

  it('P2-234: re-tapping the taken slot once it is free again recovers (flag resets, CTA re-arms)', async () => {
    const user = userEvent.setup();
    // A real client: every successful refetch lands a new generation; odd
    // generations show slot-c taken, even ones free again (availability
    // flipped between the two taps).
    const client = { gen: 0 };
    const FRESH_SNAPSHOT = [
      SLOT_A,
      SLOT_B,
      {
        ...SLOT_B,
        id: 'slot-c',
        start_time: '22:00:00',
        end_time: '23:00:00',
      },
    ];
    queryClientMock.refetchQueries.mockImplementation(async () => {
      client.gen += 1;
      return undefined;
    });
    queryClientMock.getQueryState.mockImplementation(() => ({
      data: FRESH_SNAPSHOT.map((s) =>
        s.id === 'slot-c' ? { ...s, is_booked: client.gen % 2 === 1 } : s,
      ),
      dataUpdateCount: client.gen,
    }));
    vi.mocked(usePitchSlots).mockReturnValue({
      // The SNAPSHOT still shows slot-c free (list is stale by design);
      // the user picks it, and the first fresh read refuses the pick.
      data: [SLOT_A, SLOT_B, { ...SLOT_B, id: 'slot-c', start_time: '22:00:00', end_time: '23:00:00' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    renderSheet();

    await user.click(screen.getByText('10:00 pm')); // slot-c
    await screen.findByTestId('slot-taken-error');
    expect(screen.getByRole('button', { name: /move match/i })).toBeDisabled();

    // Availability changed again — the next fresh read shows slot-c free.
    await user.click(screen.getByText('10:00 pm'));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /move match/i }),
      ).toBeEnabled();
    });
    expect(screen.queryByTestId('slot-taken-error')).not.toBeInTheDocument();
  });
});
