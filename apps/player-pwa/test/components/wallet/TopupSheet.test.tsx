import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
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

function renderSheet(
    overrides: {
        minAmount?: number;
        maxAmount?: number;
        isOnline?: boolean;
        locale?: 'en' | 'ar';
        enabled?: boolean | 'loading' | 'error';
        refetchConfig?: () => void;
        topupConfigError?: unknown;
    } = {},
) {
    const locale = overrides.locale ?? 'en';
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        onCredited: vi.fn(),
        minAmount: overrides.minAmount ?? 5,
        maxAmount: overrides.maxAmount ?? 2000,
        ...(overrides.enabled !== undefined ? { enabled: overrides.enabled } : {}),
        ...(overrides.refetchConfig !== undefined ? { refetchConfig: overrides.refetchConfig } : {}),
        ...(overrides.topupConfigError !== undefined
            ? { topupConfigError: overrides.topupConfigError }
            : {}),
    };
    render(
        <NextIntlClientProvider
            locale={locale}
            messages={locale === 'ar' ? arMessages : enMessages}
            timeZone="Asia/Riyadh"
        >
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
    // jsdom: script injection + global Moyasar stub (vendor URL since
    // 2026-11-13; the legacy CDN path is kept in the selector so a stray
    // legacy tag can never leak between tests).
    document.querySelectorAll(`script[src*="moyasar"]`).forEach((s) => s.remove());
    document.querySelectorAll(`link[href*="moyasar"]`).forEach((l) => l.remove());
    (window as { Moyasar?: unknown }).Moyasar = {
        init: vi.fn(),
    };
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    document.querySelectorAll(`script[src*="moyasar"]`).forEach((s) => s.remove());
    document.querySelectorAll(`link[href*="moyasar"]`).forEach((l) => l.remove());
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

    it('renders preset chips with Arabic-Indic numerals under locale=ar (P2-257b follow-up, run #194)', () => {
        // Reviewer B run-#194 gap: the presets were a bare {qa} interpolation —
        // Latin digits on a money surface in AR, the exact class P2-257b fixed
        // in PaymentSheet/CostFooter/PublishWarningSheet. This file post-dated
        // the census (P0-2 run #169) and was missed by it.
        renderSheet({ locale: 'ar' });
        expect(screen.getByRole('button', { name: '٢٥' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '٥٠' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '١٠٠' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '٢٠٠' })).toBeTruthy();
        // The Latin shapes must be GONE (the defect pin, PaymentSheet-test style).
        expect(screen.queryByRole('button', { name: '25' })).toBeNull();
        expect(screen.queryByRole('button', { name: '50' })).toBeNull();
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

    it('on_completed is an ASYNC function — the Moyasar form rejects sync callbacks at init', async () => {
        // Regression (2026-11-13, first real sandbox top-up): moyasar-payment-form@2.x validates
        // callbacks via constructor.name === 'AsyncFunction' || toString().startsWith('async') and
        // renders "Form configuration issue" instead of the card form when the check fails.
        renderSheet();
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
        const cb = init.mock.calls[0][0].on_completed as (...a: unknown[]) => unknown;
        const isAsync = cb.constructor.name === 'AsyncFunction' || cb.toString().startsWith('async');
        expect(isAsync).toBe(true);
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

// P2-331 (run #197): TopupSheet is the ONLY top-up surface; with the server
// flag off it must render a truthful localized notice, never a payment form.
describe('TopupSheet — enabled=false notice (P2-331)', () => {
    it('renders the localized unavailable notice and no amount/pay controls (en)', () => {
        renderSheet({ enabled: false });
        const notice = screen.getByTestId('topup-disabled-notice');
        expect(notice.textContent).toContain(enMessages.wallet.topupDisabled);
        expect(screen.queryByLabelText(enMessages.wallet.topup.amountLabel)).toBeNull();
        expect(screen.queryByRole('button', { name: enMessages.wallet.topup.payWithCard })).toBeNull();
        expect(createIntentMock).not.toHaveBeenCalled();
    });

    it('renders the Arabic notice under an ar session', () => {
        renderSheet({ enabled: false, locale: 'ar' });
        expect(screen.getByTestId('topup-disabled-notice').textContent).toContain(
            arMessages.wallet.topupDisabled,
        );
    });

    it('defaults to enabled (backward compat) — the payment form renders', () => {
        renderSheet();
        expect(screen.queryByTestId('topup-disabled-notice')).toBeNull();
        expect(screen.getByRole('button', { name: enMessages.wallet.topup.payWithCard })).toBeTruthy();
    });

    // P2-331 r2 (PR-Agent MINOR on PR #232): an enabled server must NEVER read
    // as disabled — loading and error are distinct, recoverable states.
    it("enabled='loading' renders the neutral notice, never 'unavailable'", () => {
        renderSheet({ enabled: 'loading' });
        expect(screen.getByTestId('topup-config-loading')).toBeTruthy();
        expect(screen.queryByTestId('topup-disabled-notice')).toBeNull();
        expect(screen.queryByRole('button', { name: enMessages.wallet.topup.payWithCard })).toBeNull();
    });

    it("enabled='error' renders classified copy + Try-again wired to refetchConfig", () => {
        const refetchConfig = vi.fn();
        renderSheet({
            enabled: 'error',
            refetchConfig,
            topupConfigError: Object.assign(new Error('boom'), { status: 500 }),
        });
        const errBox = screen.getByTestId('topup-config-error');
        expect(errBox.textContent).toContain(enMessages.errors.server);
        const retry = screen.getByRole('button', { name: enMessages.common.retry });
        retry.click();
        expect(refetchConfig).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('topup-disabled-notice')).toBeNull();
    });

    // P2-331 r4 (PR-Agent r3 MINOR): a mid-flow config failure must NOT
    // unmount the recovery surface for a charged-but-unverified payment —
    // degraded config states only own the sheet BEFORE the flow starts.
    it("mid-flow config degradation never unmounts the pay/recovery body", async () => {
        const { rerender } = render(
            <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Riyadh">
                <TopupSheet
                    isOpen
                    onClose={vi.fn()}
                    onCredited={vi.fn()}
                    minAmount={5}
                    maxAmount={2000}
                    enabled
                />
            </NextIntlClientProvider>,
        );
        const input = screen.getByLabelText("Amount (SAR)");
        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        // Config degrades to error mid-flow → the form host MUST stay mounted.
        rerender(
            <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Riyadh">
                <TopupSheet
                    isOpen
                    onClose={vi.fn()}
                    onCredited={vi.fn()}
                    minAmount={5}
                    maxAmount={2000}
                    enabled="error"
                    topupConfigError={Object.assign(new Error('boom'), { status: 500 })}
                />
            </NextIntlClientProvider>,
        );
        expect(screen.queryByTestId('topup-config-error')).toBeNull();
        expect(screen.queryByTestId('topup-disabled-notice')).toBeNull();
        expect(screen.getByTestId('moyasar-form-host')).toBeTruthy();
    });
});

// P0-2 (2026-11-13, owner-blocked): the CDN era loaded ONLY the script while
// the page CSP is style-src 'self' — the stylesheet never loaded and the form
// rendered unstyled (bare pink error block, invisible pay button). The vendor
// is now self-hosted; the sheet must inject BOTH the stylesheet and the
// SRI-pinned script before Moyasar.init renders the form DOM.
describe('TopupSheet — self-hosted vendor assets (P0-2 2026-11-13)', () => {
    it('injects the vendored stylesheet BEFORE calling Moyasar.init', async () => {
        renderSheet();
        fireEvent.change(screen.getByLabelText('Amount (SAR)'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const link = document.querySelector('link[rel="stylesheet"][href*="vendor/moyasar/moyasar.css"]');
            expect(link).toBeTruthy();
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
    });

    it('loads the SELF-HOSTED script with SRI — never the CDN', async () => {
        // Delete the global stub: loadMoyasarScript only injects the tag when
        // the library is not already present (exactly the first-top-up path).
        delete (window as { Moyasar?: unknown }).Moyasar;
        renderSheet();
        fireEvent.change(screen.getByLabelText('Amount (SAR)'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const script = document.querySelector('script[src*="moyasar"]') as HTMLScriptElement | null;
            expect(script).toBeTruthy();
            expect(script!.getAttribute('src')).toContain('/vendor/moyasar/moyasar.umd.js');
            expect(script!.getAttribute('integrity')).toMatch(/^sha256-/);
            expect(script!.getAttribute('crossorigin')).toBe('anonymous');
        });
        expect(document.querySelector('script[src*="cdn.jsdelivr.net"]')).toBeNull();
    });

    it('stylesheet link carries SRI integrity (CDN-free styling contract)', async () => {
        renderSheet();
        fireEvent.change(screen.getByLabelText('Amount (SAR)'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const link = document.querySelector('link[rel="stylesheet"][href*="moyasar.css"]') as HTMLLinkElement | null;
            expect(link).toBeTruthy();
            expect(link!.getAttribute('integrity')).toMatch(/^sha256-/);
        });
    });
});

// P0-2 (2026-11-13): a declined/errored payment (or a dead network at pay
// time) must surface a LOCALIZED error with the sheet usable again — the
// owner session saw the form library crash with TypeError: Failed to fetch
// and nothing useful on screen.
describe('TopupSheet — on_failure path (P0-2 2026-11-13)', () => {
    it('on_failure is an ASYNC function (same init-time validation as on_completed)', async () => {
        renderSheet();
        fireEvent.change(screen.getByLabelText('Amount (SAR)'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
        const cfg = init.mock.calls[0][0];
        expect(typeof cfg.on_failure).toBe('function');
        const cb = cfg.on_failure as (...a: unknown[]) => unknown;
        const isAsync = cb.constructor.name === 'AsyncFunction' || cb.toString().startsWith('async');
        expect(isAsync).toBe(true);
    });

    it('a failed payment shows the localized nothing-charged copy and returns to the amount form', async () => {
        renderSheet();
        fireEvent.change(screen.getByLabelText('Amount (SAR)'), { target: { value: '50' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue to card payment/i }));
        await waitFor(() => {
            const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
            expect(init).toHaveBeenCalled();
        });
        const init = (window as { Moyasar?: { init: ReturnType<typeof vi.fn> } }).Moyasar?.init as ReturnType<typeof vi.fn>;
        const cfg = init.mock.calls[0][0];
        await cfg.on_failure({ id: 'pay_failed', status: 'failed' });
        // on_failure flips stage back to 'form' — waitFor the re-render (the
        // assertion is sync; the React state flush is not).
        await waitFor(() => {
            expect(screen.getByText(enMessages.wallet.topup.paymentFailed)).toBeTruthy();
        });
        // Back on the amount form: the pay CTA is visible again.
        expect(screen.getByRole('button', { name: /Continue to card payment/i })).toBeTruthy();
        // A failed payment must NOT leave recovery ids behind.
        expect(window.sessionStorage.getItem('koralink:topup-payment-id')).toBeNull();
    });
});

// P0-2 (2026-11-13): restored ids (charged mid-flow, sheet closed/reopened or
// reconcile-credited) used to show the stale "retry confirmation" block
// forever — the restore effect never verified. Now a restored pair auto-verifies
// once; a failed auto-verify falls back to the manual retry button.
describe('TopupSheet — restored ids auto-verify (P0-2 2026-11-13)', () => {
    function seedPair() {
        window.sessionStorage.setItem('koralink:topup-payment-id', 'pay_restored123');
        window.sessionStorage.setItem('koralink:topup-intent-id', 'intent-1');
    }

    it('verify fires automatically on open — no manual retry needed for a credited pair', async () => {
        seedPair();
        verifyTopupMock.mockImplementation((_input, options) => {
            options.onSuccess({ credited: true, alreadyCredited: true, balance: '55.00', paymentId: 'pay_restored123', amountSar: 5 });
        });
        renderSheet();
        await waitFor(() => {
            expect(verifyTopupMock).toHaveBeenCalledWith(
                { paymentId: 'pay_restored123', intentId: 'intent-1' },
                expect.objectContaining({ onSuccess: expect.any(Function) }),
            );
        });
        expect(screen.queryByRole('button', { name: /Retry confirmation/i })).toBeNull();
    });

    it('a FAILED auto-verify falls back to the visible manual retry button', async () => {
        seedPair();
        verifyTopupMock.mockImplementation((_input, options) => {
            options.onError(new Error('verify failed'));
        });
        renderSheet();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Retry confirmation/i })).toBeTruthy();
        });
    });

    it('auto-verifies only ONCE per pair (manual retry owns any later attempts)', async () => {
        seedPair();
        verifyTopupMock.mockImplementation((_input, options) => {
            options.onError(new Error('verify failed'));
        });
        renderSheet();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Retry confirmation/i })).toBeTruthy();
        });
        const callsAfterAuto = verifyTopupMock.mock.calls.length;
        expect(callsAfterAuto).toBe(1);
    });
});
