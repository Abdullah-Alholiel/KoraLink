import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { FetchError } from '@/lib/fetcher';
import AppealSheet from '@/components/matches/AppealSheet';

// P2-375: AppealSheet must render localized error copy (errors.* namespace),
// never the raw backend message string.

const RAW_BACKEND_MESSAGE = 'Internal server error: duplicate key value violates constraint disputes_pkey';

function renderSheet(error?: unknown) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <AppealSheet
        isOpen
        onClose={vi.fn()}
        matchTitle="Friday 5v5"
        isPending={false}
        error={error}
        onSubmit={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('AppealSheet — localized error copy (P2-375)', () => {
  it('renders errors.server copy for a 500 FetchError, not the raw backend message', () => {
    renderSheet(new FetchError(RAW_BACKEND_MESSAGE, 500, '/matches/m-1/dispute'));
    expect(screen.getByText(enMessages.errors.server)).toBeInTheDocument();
    expect(screen.queryByText(RAW_BACKEND_MESSAGE)).toBeNull();
  });

  it('renders errors.network copy for a network failure (distinct from server)', () => {
    renderSheet(new TypeError('Failed to fetch'));
    expect(screen.getByText(enMessages.errors.network)).toBeInTheDocument();
    expect(screen.queryByText(enMessages.errors.server)).toBeNull();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('renders errors.conflict copy for a 409 FetchError', () => {
    renderSheet(new FetchError('Dispute already exists for this match', 409, '/matches/m-1/dispute'));
    expect(screen.getByText(enMessages.errors.conflict)).toBeInTheDocument();
    expect(screen.queryByText('Dispute already exists for this match')).toBeNull();
  });

  it('never renders the literal backend message anywhere in the sheet', () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      const { container, unmount } = renderSheet(
        new FetchError(RAW_BACKEND_MESSAGE, status, '/matches/m-1/dispute'),
      );
      expect(container.ownerDocument.body.textContent ?? '').not.toContain(RAW_BACKEND_MESSAGE);
      unmount();
    }
  });

  it('renders no error block when there is no error', () => {
    renderSheet(undefined);
    expect(screen.queryByText(enMessages.errors.server)).toBeNull();
    expect(screen.queryByText(enMessages.errors.network)).toBeNull();
    expect(screen.queryByText(enMessages.errors.unknown)).toBeNull();
  });
});
