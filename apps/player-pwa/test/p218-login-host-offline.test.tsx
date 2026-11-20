/**
 * Run #218 tripwire — offline affordances on login (P2-386) and the host
 * form (P2-381 rider), following verify-page.offline-locale.test.tsx and
 * p2384-match-offline.test.tsx:
 *  (a) login renders the shared OfflineBanner + login.offlineNotice offline
 *  (b) login submit offline does NOT fire send-otp; the notice shows inline
 *  (c) host form renders the banner + a disabled publish CTA offline
 *  (d) both surfaces render normally online (no banner)
 *  (e) EN + AR carry the new keys with namespace leaf parity
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import LoginPage from '@/app/[locale]/(auth)/login/page';
import HostMatchForm from '@/components/host/HostMatchForm';

const onlineMock = vi.fn(() => true);
vi.mock('@/hooks/useOnlineStatus', () => ({
    useOnlineStatus: () => onlineMock(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    usePathname: () => '/en/login',
    useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/fetcher', async () => {
    const actual = await vi.importActual<typeof import('@/lib/fetcher')>('@/lib/fetcher');
    return { ...actual, fetcher: vi.fn(() => new Promise(() => {})) };
});

vi.mock('@/components/auth/DevLoginBar', () => ({ default: () => null }));

import { fetcher } from '@/lib/fetcher';
const fetcherMock = vi.mocked(fetcher);

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

type Messages = Record<string, unknown>;
const countLeaves = (node: unknown): number =>
    node && typeof node === 'object'
        ? Object.values(node as Messages).reduce<number>((s, c) => s + countLeaves(c), 0)
        : 1;

const LOGIN_NOTICE = en.login.offlineNotice;
const HOST_NOTICE = en.host.offlineNotice;

function wrap(ui: ReactNode, locale: 'en' | 'ar' = 'en') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en}>
                {ui}
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

const sendOtpCalls = () =>
    fetcherMock.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('otp'));

beforeEach(() => {
    vi.clearAllMocks();
    onlineMock.mockReturnValue(true);
    sessionStorage.clear();
    localStorage.clear();
});

describe('login — offline affordance (run #218 P2-386)', () => {
    it('(a) renders the shared OfflineBanner with login.offlineNotice when offline', () => {
        onlineMock.mockReturnValue(false);
        wrap(<LoginPage />);
        const banner = screen.getByRole('status');
        expect(banner).toHaveTextContent(LOGIN_NOTICE);
    });

    it('(b) submit offline does not fire send-otp and shows the inline notice', async () => {
        onlineMock.mockReturnValue(false);
        wrap(<LoginPage />);
        fireEvent.change(screen.getByPlaceholderText('5X XXX XXXX'), {
            target: { value: '501234567' },
        });
        fireEvent.click(screen.getByRole('button', { name: en.login.continue }));
        // flush the mutation microtask before asserting nothing was sent
        await new Promise((r) => setTimeout(r, 0));
        expect(fetcherMock).not.toHaveBeenCalled();
        // banner + inline error slot both carry the notice
        expect(screen.getAllByText(LOGIN_NOTICE).length).toBe(2);
        expect(screen.getByText(LOGIN_NOTICE, { selector: 'p.text-brand-red' })).toBeInTheDocument();
    });

    it('(d) online: no banner, submit fires send-otp', async () => {
        wrap(<LoginPage />);
        expect(screen.queryByText(LOGIN_NOTICE)).not.toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('5X XXX XXXX'), {
            target: { value: '501234567' },
        });
        fireEvent.click(screen.getByRole('button', { name: en.login.continue }));
        await waitFor(() => expect(sendOtpCalls().length).toBe(1));
    });

    it('AR: offline banner resolves the Arabic copy', () => {
        onlineMock.mockReturnValue(false);
        wrap(<LoginPage />, 'ar');
        expect(screen.getByRole('status')).toHaveTextContent(ar.login.offlineNotice);
    });

    it('source pin: useLocale(), not a pathname split; shared imports', () => {
        const src = read('src/app/[locale]/(auth)/login/page.tsx');
        expect(src).toContain('useLocale(');
        expect(src).not.toContain("split('/')[1]");
        expect(src).toMatch(/import\s*\{\s*useOnlineStatus\s*\}\s*from\s*'@\/hooks\/useOnlineStatus'/);
        expect(src).toMatch(/import\s+OfflineBanner\s+from\s+'@\/components\/layout\/OfflineBanner'/);
        // P2-380 switch-to-email CTA + F1 Turnstile arming stay wired
        expect(src).toContain("setErrorAction('switchEmail')");
        expect(src).toContain('turnstileArmed && !turnstileToken');
    });
});

describe('host form — offline affordance (run #218 P2-381)', () => {
    it('(c) offline: banner with host.offlineNotice + publish disabled with localized label', () => {
        onlineMock.mockReturnValue(false);
        wrap(<HostMatchForm />);
        const banners = screen.getAllByRole('status').filter((el) => el.textContent?.includes(HOST_NOTICE));
        expect(banners.length).toBe(1);
        const publish = screen.getByTestId('host-publish');
        expect(publish).toBeDisabled();
        expect(publish).toHaveAttribute('aria-label', HOST_NOTICE);
        expect(publish).toHaveAttribute('title', HOST_NOTICE);
    });

    it('(d) online: no banner, publish button has no offline label', () => {
        wrap(<HostMatchForm />);
        expect(screen.queryByText(HOST_NOTICE)).not.toBeInTheDocument();
        const publish = screen.getByTestId('host-publish');
        expect(publish).not.toHaveAttribute('aria-label');
        expect(publish).not.toHaveAttribute('title');
    });
});

describe('i18n parity — run #218 offline keys', () => {
    it('(e) login.offlineNotice + host.offlineNotice exist in EN and AR with leaf parity', () => {
        for (const ns of ['login', 'host'] as const) {
            const e = (en as Messages)[ns] as Messages;
            const a = (ar as Messages)[ns] as Messages;
            for (const v of [e['offlineNotice'], a['offlineNotice']]) {
                expect(typeof v).toBe('string');
                expect((v as string).trim().length).toBeGreaterThan(0);
            }
            expect(countLeaves(a)).toBe(countLeaves(e));
            expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
        }
        expect(countLeaves(ar)).toBe(countLeaves(en));
    });
});
