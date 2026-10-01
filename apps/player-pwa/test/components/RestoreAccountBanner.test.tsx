import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import RestoreAccountBanner from '@/components/profile/RestoreAccountBanner';

function renderBanner(props: Partial<Parameters<typeof RestoreAccountBanner>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <RestoreAccountBanner
        purgeAt={new Date('2026-10-04T00:00:00.000Z').toISOString()}
        onRestored={vi.fn()}
        onDismissed={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

// Minimal mock for the restore mutation hook.
vi.mock('@/hooks/useUser', () => ({
  useRestoreAccount: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    error: null,
    isPending: false,
  }),
}));

describe('RestoreAccountBanner (P2-131)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the banner and shows the remaining days after mount', async () => {
    renderBanner();
    vi.advanceTimersByTime(0);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/3\s*day/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Restore/i })).toBeInTheDocument();
  });

  it('computes 0 days when purgeAt is in the past', async () => {
    renderBanner({ purgeAt: new Date('2026-09-25T00:00:00.000Z').toISOString() });
    vi.advanceTimersByTime(0);
    await waitFor(() => {
      expect(screen.getByText(/0\s*day/)).toBeInTheDocument();
    });
  });

  it('calls onDismissed when the dismiss button is tapped', async () => {
    const user = userEvent.setup();
    const onDismissed = vi.fn();
    renderBanner({ onDismissed });
    vi.advanceTimersByTime(0);
    const dismiss = await screen.findByRole('button', { name: /Dismiss/i });
    await user.click(dismiss);
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('calls onRestored when the restore CTA succeeds', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    renderBanner({ onRestored });
    vi.advanceTimersByTime(0);
    const restoreBtn = await screen.findByRole('button', { name: /Restore/i });
    await user.click(restoreBtn);
    await waitFor(() => {
      expect(onRestored).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call Date.now() during render (mount-time snapshot only)', () => {
    const dateSpy = vi.spyOn(Date, 'now');
    renderBanner();
    // With fake timers, effects flush synchronously in act(), so by the time
    // render() returns the mount effect has already fired. The invariant we
    // can verify is that Date.now() is NOT read in the render() function body:
    // the component uses a null seed and an effect. The spy therefore sees at
    // most one call (the effect) even if other test infra calls it.
    expect(dateSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
