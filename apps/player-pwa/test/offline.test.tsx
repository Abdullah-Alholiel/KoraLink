import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Offline from '@/app/[locale]/offline';

describe('Offline page', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { reload: vi.fn() });
  });

  it('renders the Arabic "no internet" heading', () => {
    render(<Offline />);
    expect(
      screen.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت' })
    ).toBeInTheDocument();
  });

  it('retry button has accessible label', () => {
    render(<Offline />);
    expect(
      screen.getByRole('button', { name: /retry connection/i })
    ).toBeInTheDocument();
  });

  it('clicking retry calls window.location.reload()', async () => {
    const user = userEvent.setup();
    render(<Offline />);
    await user.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(window.location.reload).toHaveBeenCalledOnce();
  });
});
