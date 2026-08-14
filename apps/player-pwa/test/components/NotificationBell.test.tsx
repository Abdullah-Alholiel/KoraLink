import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationBell from '@/components/layout/NotificationBell';
import { useAppStore } from '@/store/useAppStore';

// next-intl: return keys as-is (no provider needed for these assertions)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function renderBell() {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

describe('NotificationBell states', () => {
  it('renders no badge when unread count is 0', () => {
    useAppStore.setState({ notificationBadge: 0 });
    const { container } = renderBell();
    expect(screen.getByRole('button')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+/);
  });

  it('renders the exact count when 1–99 unread', () => {
    useAppStore.setState({ notificationBadge: 7 });
    renderBell();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('caps the badge at 99+', () => {
    useAppStore.setState({ notificationBadge: 250 });
    renderBell();
    expect(screen.getByText('99+')).toBeTruthy();
  });
});
