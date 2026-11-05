import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import type { VenueApi } from '@/hooks/useVenues';
import VenuePickerSheet from '@/components/host/VenuePickerSheet';

// ── P2-307 (run #187): a FAILED venues fetch must render the classified
// ErrorState + retry — never the "No venues found" empty state. ──

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const mockState: {
  data: VenueApi[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: { name: string; message: string; status: number } | null;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => mockState,
}));

function venue(id: string, name: string): VenueApi {
  return {
    id,
    name,
    city: 'Riyadh',
    address: 'King Fahd Rd',
    amenities: [],
    is_approved: true,
    is_koralink_partner: true,
    distance_m: null,
    owner_id: 'owner-1',
    owner_name: null,
    pitch_count: 2,
  } as VenueApi;
}

function renderSheet() {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <VenuePickerSheet open onClose={vi.fn()} onSelect={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe('VenuePickerSheet states (P2-307)', () => {
  beforeEach(() => {
    mockState.data = undefined;
    mockState.isLoading = false;
    mockState.isError = false;
    mockState.error = null;
    mockState.refetch = vi.fn();
  });

  it('loading → renders skeleton placeholders and no venue list', () => {
    mockState.isLoading = true;
    renderSheet();
    expect(document.body.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(screen.queryByText(enMessages.host.noVenuesFound)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('venues present → renders venue names', () => {
    mockState.data = [venue('v1', 'Olympia Arena'), venue('v2', 'Green Field Club')];
    renderSheet();
    expect(screen.getByText('Olympia Arena')).toBeInTheDocument();
    expect(screen.getByText('Green Field Club')).toBeInTheDocument();
    expect(screen.queryByText(enMessages.host.noVenuesFound)).not.toBeInTheDocument();
  });

  it('empty without search → renders host.noVenuesFound', () => {
    mockState.data = [];
    renderSheet();
    expect(screen.getByText(enMessages.host.noVenuesFound)).toBeInTheDocument();
  });

  it('empty with search → renders host.noVenuesFoundIn with the city', async () => {
    const user = userEvent.setup();
    mockState.data = [];
    renderSheet();
    await user.type(screen.getByRole('textbox'), 'Jeddah');
    expect(screen.getByText('No venues found in "Jeddah"')).toBeInTheDocument();
  });

  it('error → renders the classified ErrorState (not the empty state) and retry calls refetch', async () => {
    const user = userEvent.setup();
    mockState.isError = true;
    mockState.error = { name: 'FetchError', message: 'Internal Server Error', status: 503 };
    renderSheet();
    expect(screen.getByText(enMessages.errors.server)).toBeInTheDocument();
    expect(screen.queryByText(enMessages.host.noVenuesFound)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: enMessages.common.retry }));
    expect(mockState.refetch).toHaveBeenCalledTimes(1);
  });
});
