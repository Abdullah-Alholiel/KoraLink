import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import WalletPage from '@/app/[locale]/(main)/wallet/page';
import { useAppStore } from '@/store/useAppStore';

// ── P2-257 (run #164): wallet money renders locale-aware — DECISIONS.md
// 2026-09-08 mandates Arabic-Indic numerals; the page used to hardcode
// `balance.toFixed(2)` + a raw `﷼` glyph (Latin digits for AR users), and a
// failed balance fetch left the player stranded with no retry. The canonical
// helper is formatMoney (P2-128; profile page already routes through it).

const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/wallet',
}));

const downloadTextAsFile = vi.fn();
vi.mock('@/lib/download', () => ({
  downloadTextAsFile: (...args: unknown[]) => downloadTextAsFile(...args),
}));

const TXN_ROW = {
  id: 'txn_1',
  user_id: 'user-1',
  type: 'DEBIT',
  amount: '45.00',
  reference_type: 'MATCH_FEE',
  reference_id: 'match-123456789',
  idempotency_key: 'k-txn_1',
  status: 'Completed',
  created_at: '2026-09-20T18:30:00.000Z',
};

function renderPage(locale: 'ar' | 'en') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        messages={locale === 'ar' ? arMessages : enMessages}
        locale={locale}
      >
        <WalletPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('WalletPage — locale-aware money (P2-257, run #164)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ toast: null } as never);
    mockFetcher.mockImplementation(async (path: string) => {
      if (path === '/wallet/balance') return { balance: '100.00' };
      return { transactions: [TXN_ROW], total: 1, hasMore: false };
    });
  });

  it('EN balance renders the canonical SAR shape (SAR100.00)', async () => {
    renderPage('en');
    // NBSP between the currency code and amount is Intl's spacing — \s* covers it.
    await screen.findByText(/^SAR\s*100\.00$/);
  });

  it('AR balance renders Arabic-Indic digits — no Latin 100.00 remains', async () => {
    renderPage('ar');
    await waitFor(() => {
      expect(screen.getByText(/١٠٠/)).toBeTruthy();
      expect(screen.queryByText(/100\.00/)).toBeNull();
    });
  });

  it('EN debit txn renders the Intl negative shape (sign + SAR45.00)', async () => {
    renderPage('en');
    await waitFor(() => {
      const el = screen.getByText(/45\.00/);
      expect(el.textContent).toMatch(/[−-]/); // minus, wherever ICU places it
      expect(el.textContent).toContain('SAR');
      expect(el.textContent).not.toContain('﷼'); // glyph retired
    });
  });

  it('AR debit txn renders Arabic-Indic digits with the − sign', async () => {
    renderPage('ar');
    await waitFor(() => {
      const el = screen.getByText(/٤٥/); // Arabic-Indic 45
      expect(el.textContent).toMatch(/[−-]/);
      expect(el.textContent).not.toMatch(/[0-9]/); // zero Latin digits
    });
  });

  it('a failed balance fetch shows ErrorState with a working retry (P2-257)', async () => {
    mockFetcher.mockImplementation(async (path: string) => {
      if (path === '/wallet/balance') throw new Error('boom');
      return { transactions: [], total: 0, hasMore: false };
    });
    renderPage('en');
    // useWalletBalance has retry:false — the button is the ONLY recovery path.
    const retry = await screen.findByRole('button', {
      name: enMessages.common.retry,
    });
    mockFetcher.mockImplementation(async (path: string) => {
      if (path === '/wallet/balance') return { balance: '100.00' };
      return { transactions: [], total: 0, hasMore: false };
    });
    fireEvent.click(retry);
    await screen.findByText(/^SAR\s*100\.00$/);
  });
});

describe('wallet money tripwire (P2-257)', () => {
  it('wallet page routes money through formatMoney — no toFixed, no ﷼ glyph', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      'src/app/[locale]/(main)/wallet/page.tsx',
      'utf8',
    );
    expect(src).toMatch(
      /import \{[^}]*\bformatMoney\b[^}]*\} from '@\/lib\/format'/,
    );
    expect(src).not.toContain('﷼');
    expect(src).not.toContain('.toFixed(');
  });
});
