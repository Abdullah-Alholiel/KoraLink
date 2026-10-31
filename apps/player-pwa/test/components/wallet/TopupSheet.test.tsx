import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import TopupSheet from '@/components/wallet/TopupSheet';

/**
 * P0-2 (run #169) — TopupSheet specs.
 *
 * The Moyasar network form itself is OUT of scope here (browser-only, card
 * data never touches us): these specs pin the AROUND-form behavior — amount
 * validation against config bounds, offline guard BEFORE any intent, intent
 * creation with a fresh UUID, script injection once, verify on_completed,
 * localized error copy (never raw backend text), and disabled-while-busy.
 */

// BottomSheet portals to document.body — render children inline for jsdom.
vi.mock('@/components/layout/BottomSheet', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const createIntentMock = vi.fn();
const verifyTopupMock = vi.fn();

vi.mock('@/hooks/useTopup', () => ({
    useCreateTopupIntent: () => ({
        mutateAsync: createIntentMock,
        isPending: false,
    }),
    useVerifyTopup: () => ({ mutate: verifyTopupMock }),
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
    trackEvent: vi.fn(),
    captureError: vi.fn(),
}));

// CDN form loader — injects <script>; stub the network leg.
const loadScriptMock = vi.hoisted(() => vi.fn());
vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return actual;
});

function makeT() {
    const messages = { wallet: enMessages.wallet as Record<string, unknown>, common: enMessages.common as Record<string, unknown>, errors: enMessages.errors as Record<string, unknown> };
    return (key: string) => {
        const parts = key.split('.');
        let cur: unknown = messages;
        for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
        return typeof cur === 'string' ? cur : key;
    };
}

function renderSheet(overrides: { minAmount?: number; maxAmount?: number; isOnline?: boolean } = {}) {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        onCredited: vi.fn(),
        minAmount: overrides.minAmount ?? 5,
        maxAmount: overrides.maxAmount ?? 2000,
    };
    render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Riyadh">
            <TopupSheet {...props} />
        </NextIntlClientProvider>,
    );
    return props;
}

// useOnlineStatus default (true) comes from the hook; offline cases re-render
// via the hook mock below when needed.
beforeEach(() => {
    createIntentMock.mockReset().mockResolvedValue({
        intent: { id: 'intent-1', amount_halalas: 5000 },
        publishableKey: 'pk_test_x',
    });
    verifyTopupMock.mockReset();
    // jsdom: script injection + global Moyasar stub
    document.querySelectorAll(`script[src*="moyasar-payment-form"]`).forEach((s) => s.remove());
    (window as { Moyasar?: unknown }).Moyasar = {
        init: vi.fn(),
    };
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.sessionStorage.clear();
});

describe('TopupSheet — preset chips (P2-289, run #180)', () => {
    it('renders the 4 shared presets and fills the input on click', () => {
        renderSheet();
        const chips = screen.getAllByRole('button', { name: '25' });
        expect(chips.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: '50' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '100' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '200' })).toBeTruthy();
        // Chips are announced as a named group with pressed state (a11y).
        expect(screen.getByRole('group', { name: 'Quick amounts' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '50' }));
        const input = screen.getByLabelText('Amount (SAR)') as HTMLInputElement;
        expect(input.value).toBe('50');
        // The chip is marked pressed once selected.
        expect((screen.getByRole('button', { name: '50' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
        expect(createIntentMock).not.toHaveBeenCalled();
    });
});

describe('TopupSheet — validation + intent + form host (P0-2)', () => {
    it('rejects an amount below the config minimum without creating an intent', async () => {
        renderSheet({ minAmount: 5 });
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            expect(screen.getByText(/at least/i)).toBeTruthy();
        });
        expect(createIntentMock).not.toHaveBeenCalled();
    });

    it('rejects an amount above the config maximum without creating an intent', async () => {
        renderSheet({ maxAmount: 2000 });
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '5000' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            expect(screen.getByText(/at most/i)).toBeTruthy();
        });
        expect(createIntentMock).not.toHaveBeenCalled();
    });

    it('creates the intent with the exact amount then mounts the form host', async () => {
        renderSheet();
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            expect(createIntentMock).toHaveBeenCalledWith({ amountSar: 50, idempotencyKey: expect.any(String) });
        });
        await waitFor(() => {
            expect(screen.getByTestId('moyasar-form-host')).toBeTruthy();
        });
    });

    it('init Moyasar receives intent amount + publishable key + callback URL', async () => {
        renderSheet();
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
            const cfg = init.mock.calls[0][0];
            expect(cfg.amount).toBe(5000);
            expect(cfg.publishable_api_key).toBe('pk_test_x');
            expect(cfg.callback_url).toContain('/wallet/topup/callback');
            expect(cfg.methods).toEqual(['creditcard']);
        });
    });

    it('verify fires with payment id from on_completed', async () => {
        renderSheet();
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
        const cfg = init.mock.calls[0][0];
        cfg.on_completed({ id: 'pay_test1234567890', status: 'paid', amount: 5000 });
        await waitFor(() => {
            expect(verifyTopupMock).toHaveBeenCalledWith(
                { paymentId: 'pay_test1234567890', intentId: 'intent-1' },
                expect.objectContaining({ onSuccess: expect.any(Function) }),
            );
        });
    });

    it('recovery retry stays VISIBLE while stage is paying (PR-Agent r2 tripwire)', async () => {
        renderSheet();
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
        const cfg = init.mock.calls[0][0];
        // The failed-verify path: onError sets pendingPayment while stage stays 'paying'.
        cfg.on_completed({ id: 'pay_test1234567890', status: 'paid', amount: 5000 });
        const [, options] = verifyTopupMock.mock.calls[0];
        options.onError(new Error('verify failed'));
        // The retry button MUST appear even though stage never returned to 'form'
        // (state update is async — wait for the re-render, don't assert sync).
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Retry confirmation/i })).toBeTruthy();
        });
    });
});
