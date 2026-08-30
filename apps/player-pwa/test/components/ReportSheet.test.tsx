import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import ReportSheet from '@/components/matches/ReportSheet';
import { fetcher } from '@/lib/fetcher';

// Mock the API client — the sheet submits POST /reports through useReport().
vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

function renderSheet(props: Partial<Parameters<typeof ReportSheet>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ReportSheet
          open
          onClose={() => {}}
          subjectType="message"
          subjectId="pm-123"
          subjectLabel="Direct message"
          title="Report this message"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ReportSheet — chat message reporting (P1-31)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
  });

  it('renders the custom title and disables submit until a reason is entered', async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByText('Report this message')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /submit report/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/abusive/i), 'inappropriate content');
    expect(submit).toBeEnabled();
  });

  it('submits subjectType=message and shows the success state', async () => {
    const user = userEvent.setup();
    vi.mocked(fetcher).mockResolvedValueOnce({ id: 'r1', status: 'open' });
    renderSheet();
    await user.type(screen.getByPlaceholderText(/abusive/i), 'inappropriate content');
    await user.click(screen.getByRole('button', { name: /submit report/i }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        '/reports',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"subjectType":"message"'),
        }),
      );
    });
    expect(await screen.findByText('Report submitted')).toBeInTheDocument();
  });

  it('shows the API error inline when the submission fails', async () => {
    const user = userEvent.setup();
    vi.mocked(fetcher).mockRejectedValueOnce(new Error('You cannot report your own message.'));
    renderSheet({ subjectId: 'own-msg' });
    await user.type(screen.getByPlaceholderText(/abusive/i), 'inappropriate content');
    await user.click(screen.getByRole('button', { name: /submit report/i }));
    expect(
      await screen.findByText(/You cannot report your own message/i),
    ).toBeInTheDocument();
  });
});
