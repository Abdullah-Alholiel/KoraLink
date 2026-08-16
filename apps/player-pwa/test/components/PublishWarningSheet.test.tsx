import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import PublishWarningSheet from '@/components/host/PublishWarningSheet';

function renderSheet(props: Partial<Parameters<typeof PublishWarningSheet>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <PublishWarningSheet
        open
        mode="self"
        onConfirm={() => {}}
        onCancel={() => {}}
        isPending={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('PublishWarningSheet — contextual publish errors', () => {
  it('renders no error block when clean', () => {
    renderSheet();
    expect(screen.queryByTestId('publish-error')).toBeNull();
  });

  it('renders the localized insufficient-balance error at the moment of failure', () => {
    renderSheet({ errorKey: 'host.errorInsufficientBalance' });
    const alert = screen.getByTestId('publish-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByText("Couldn't publish")).toBeInTheDocument();
    expect(
      screen.getByText(/wallet doesn't have enough balance/i),
    ).toBeInTheDocument();
  });

  it('re-enables confirm after an error so the user can retry', () => {
    const onConfirm = vi.fn();
    renderSheet({ errorKey: 'host.errorSlotTaken', onConfirm });
    const confirm = screen.getByRole('button', { name: /i understand|confirm/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm while publishing', () => {
    renderSheet({ isPending: true });
    expect(
      screen.getByRole('button', { name: /publishing/i }),
    ).toBeDisabled();
  });
});
