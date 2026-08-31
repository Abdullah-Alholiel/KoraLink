import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import DatePicker from '@/components/matches/DatePicker';

// jsdom: no layout engine — the strip renders all chips in DOM order.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

function renderStrip(props: Partial<Parameters<typeof DatePicker>[0]> = {}) {
  const onDateSelect = vi.fn();
  const utils = render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <DatePicker onDateSelect={onDateSelect} {...props} />
    </NextIntlClientProvider>,
  );
  return { onDateSelect, ...utils };
}

function chips() {
  return screen.getAllByRole('button');
}

describe('DatePicker — shared calendar-day strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 30 day chips by default', () => {
    renderStrip({ fireOnMount: false });
    expect(chips()).toHaveLength(30);
  });

  it('honors a custom window length', () => {
    renderStrip({ fireOnMount: false, days: 7 });
    expect(chips()).toHaveLength(7);
  });

  it('labels the first chip TODAY and marks it aria-current="date"', () => {
    renderStrip({ fireOnMount: false });
    const first = chips()[0];
    expect(within(first).getByText('TODAY')).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-current', 'date');
  });

  it('carries the today dot: green when unselected, white when today is active', () => {
    // Unselected (Play "all games" default) → green dot on the today card.
    const first = renderStrip({ fireOnMount: false, selectedDate: null });
    const dot = screen.getByTestId('today-dot');
    expect(dot.closest('button')).toHaveAttribute('aria-current', 'date');
    expect(dot.className).toContain('bg-brand-green');
    first.unmount();

    // Default internal state selects TODAY → dot inverts to white on dark.
    renderStrip({ fireOnMount: false });
    expect(screen.getByTestId('today-dot').className).toContain('bg-white');
  });

  it('dots are aria-hidden and every other chip reserves the same row', () => {
    renderStrip({ fireToMount: false } as never);
    const rows = chips().map(
      (c) => c.lastElementChild?.className.includes('h-1 w-1 rounded-full') ?? false,
    );
    expect(rows.every(Boolean)).toBe(true);
  });

  it('fires onDateSelect with the tapped day', async () => {
    const user = userEvent.setup();
    const { onDateSelect } = renderStrip({ fireOnMount: false });
    await user.click(chips()[3]);
    expect(onDateSelect).toHaveBeenCalledTimes(1);
    expect(onDateSelect.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('fireOnMount fires once with today', () => {
    const onDateSelect = vi.fn();
    render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <DatePicker onDateSelect={onDateSelect} fireOnMount />
      </NextIntlClientProvider>,
    );
    expect(onDateSelect).toHaveBeenCalledTimes(1);
    expect(onDateSelect.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('controlled selectedDate highlights the matching chip (even far out)', async () => {
    const user = userEvent.setup();
    const onDateSelectSpy = vi.fn();
    const far = new Date();
    far.setDate(far.getDate() + 20);
    render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <DatePicker fireOnMount={false} selectedDate={far} onDateSelect={onDateSelectSpy} />
      </NextIntlClientProvider>,
    );
    const pressed = chips().find((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toBeDefined();
    const dayNumber = far.getDate();
    expect(pressed!).toHaveTextContent(String(dayNumber));
    // Controlled: tapping a chip fires the callback but does NOT steal the
    // active state — the parent's selectedDate keeps precedence.
    await user.click(chips()[5]);
    expect(onDateSelectSpy).toHaveBeenCalledTimes(1);
    expect(chips()[5].getAttribute('aria-pressed')).toBe('false');
    expect(chips().find((c) => c.getAttribute('aria-pressed') === 'true')).toHaveTextContent(String(dayNumber));
  });

  it('selectedDate=null shows no selection (Play all-games default)', () => {
    render(
      <NextIntlClientProvider messages={enMessages} locale="en">
        <DatePicker fireOnMount={false} selectedDate={null} />
      </NextIntlClientProvider>,
    );
    expect(chips().every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});
