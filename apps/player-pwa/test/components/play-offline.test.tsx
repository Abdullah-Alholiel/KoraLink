/**
 * Play feed — offline vs fetch-error branches.
 *
 * Rendering the full PlayPage needs location/suggestions/store providers, so
 * this file mirrors the page's error/offline JSX branch in a tiny test-only
 * fixture (PlayErrorBranches) that uses the REAL OfflineBanner component.
 * Keep the fixture in sync with src/app/[locale]/(main)/play/page.tsx
 * sections "2. Error State" and "5. Edge Case". The page-level wiring
 * (`isOffline={!isOnline}` + useOnlineStatus) is pinned structurally by
 * test/structure/offline-banner-coverage.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertTriangle } from 'lucide-react';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { classifyError, errorKey } from '@/lib/error-classify';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

function PlayErrorBranches({
  error,
  isLoading,
  isOnline,
  refetch,
}: {
  error: unknown;
  isLoading: boolean;
  isOnline: boolean;
  refetch: () => void;
}) {
  const t = (key: string) => key;
  return (
    <div>
      {error != null && !isLoading && isOnline && (
        <div className="flex flex-col items-center justify-center py-20 px-8">
          <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-brand-black mb-6 text-center">
            {t(errorKey(classifyError(error)))}
          </h3>
          <button onClick={() => refetch()}>{t('common.retry')}</button>
        </div>
      )}
      <OfflineBanner isOffline={!isOnline} variant="plain" className="mx-4 mb-3" />
    </div>
  );
}

describe('play feed offline/error branches', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('offline → offline banner only, no error block', () => {
    render(
      <PlayErrorBranches error={new Error('x')} isLoading={false} isOnline={false} refetch={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe('offlineBanner');
    expect(screen.queryByText('common.retry')).toBeNull();
  });

  it('online + fetch error → error block with localized message + retry, NO offline banner', () => {
    const refetch = vi.fn();
    const error = new Error('Server error');
    render(<PlayErrorBranches error={error} isLoading={false} isOnline refetch={refetch} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('heading').textContent).toBe(errorKey(classifyError(error)));
    fireEvent.click(screen.getByText('common.retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('online, no error → neither branch renders', () => {
    const { container } = render(
      <PlayErrorBranches error={null} isLoading={false} isOnline refetch={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });
});
