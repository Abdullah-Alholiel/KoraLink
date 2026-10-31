import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import ReportDisputeSheet from '@/components/matches/ReportDisputeSheet';

// ── P1-69 (run #166): the player dispute-origination sheet must present the
// five shared categories, gate submit on a selection, classify failures to
// localized copy, and swap the form for an under-review card when an open
// dispute already exists.

// BottomSheet portals to document.body — render children inline for jsdom.
vi.mock('@/components/layout/BottomSheet', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeT(ns: string) {
    const messages: Record<string, Record<string, unknown>> = {
        dispute: enMessages.dispute as Record<string, unknown>,
        common: enMessages.common as Record<string, unknown>,
        errors: enMessages.errors as Record<string, unknown>,
    };
    return (key: string, values?: Record<string, unknown>) => {
        // Full-path keys (e.g. "errors.network" from errorKey()) resolve from
        // the messages root; bare keys resolve inside the hook's namespace.
        const full = key.includes('.') ? key : `${ns}.${key}`;
        const parts = full.split('.');
        let cur: unknown = messages;
        for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
        if (typeof cur !== 'string') return full;
        if (values) {
            return Object.entries(values).reduce(
                (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
                cur,
            );
        }
        return cur;
    };
}

vi.mock('next-intl', () => ({
    useTranslations: (ns: string) => makeT(ns),
}));

const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    matchTitle: 'Padel at Lotus Club',
    openDispute: null as { type: string; status: string } | null,
    isPending: false,
    error: null as Error | null,
    isOffline: false,
    onSubmit: vi.fn(),
};

function renderSheet(overrides: Partial<typeof baseProps> = {}) {
    return render(<ReportDisputeSheet {...baseProps} {...overrides} />);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ReportDisputeSheet (P1-69)', () => {
    it('RDR-1: renders all five categories; submit is disabled until one is chosen, then fires with type + reason', () => {
        renderSheet();

        expect(screen.getByText('Player marked as no-show')).toBeTruthy();
        expect(screen.getByText('Pitch was double-booked')).toBeTruthy();
        expect(screen.getByText('Pitch condition problem')).toBeTruthy();
        expect(screen.getByText('Unrecognized charge')).toBeTruthy();
        expect(screen.getByText('Something else')).toBeTruthy();

        const submit = screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        fireEvent.click(screen.getByRole('radio', { name: 'Pitch was double-booked' }));
        expect((screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement).disabled).toBe(false);

        fireEvent.change(screen.getByPlaceholderText(/Describe the problem/), { target: { value: 'They booked the slot twice' } });
        fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

        expect(baseProps.onSubmit).toHaveBeenCalledTimes(1);
        expect(baseProps.onSubmit).toHaveBeenCalledWith('double_booking', 'They booked the slot twice');
    });

    it('RDR-2: a 400 failure renders the CLASSIFIED validation copy (never raw backend text)', () => {
        renderSheet({ error: Object.assign(new Error('Bad Request'), { status: 400, name: 'FetchError' }) });

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe(
            "This report can't be filed this way. If you're disputing a no-show, it must be on a match where you were marked.",
        );
    });

    it('RDR-3: a network failure renders the network copy', () => {
        renderSheet({ error: Object.assign(new Error('Failed to fetch'), { status: 0 }) });

        expect(screen.getByRole('alert').textContent).toBe(
            'Connection problem — check your internet and try again.',
        );
    });

    it('RDR-8: a 403 renders the dispute-refined forbidden copy (PR-Agent r1 regression: never a raw key string)', () => {
        renderSheet({ error: Object.assign(new Error('Forbidden'), { status: 403, name: 'FetchError' }) });

        const text = screen.getByRole('alert').textContent ?? '';
        expect(text).toBe('Only match players can file a report on this match.');
        // Raw-key rendering (the r1 bug) would leak the literal path here.
        expect(text).not.toContain('dispute.');
        expect(text).not.toContain('errors.');
    });

    it('RDR-4: an open dispute swaps the form for a status card and hides the category picker', () => {
        renderSheet({ openDispute: { type: 'double_booking', status: 'opened' } });

        expect(screen.getByText('Report received')).toBeTruthy();
        expect(screen.getByText(/Pitch was double-booked/)).toBeTruthy();
        expect(screen.queryByRole('radiogroup')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit report' })).toBeNull();
    });

    it('RDR-5: the no-show hint shows only when that category is selected', () => {
        renderSheet();

        expect(screen.queryByText(/dispute a no-show mark only/)).toBeNull();

        fireEvent.click(screen.getByRole('radio', { name: 'Player marked as no-show' }));
        expect(screen.getByText(/dispute a no-show mark only/)).toBeTruthy();
    });

    it('RDR-6: pending submit shows a disabled button (double-submit guard)', () => {
        renderSheet({ isPending: true });

        // No category selected yet — disabled either way; select one to prove pending keeps it disabled.
        fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
        expect((screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('RDR-7: closed sheet renders nothing', () => {
        const { container } = renderSheet({ isOpen: false });
        expect(container.textContent).toBe('');
    });

    // ── P2-263 (run #168): offline guard ──────────────────────────────────────
    it('RDR-9: offline shows the localized offline note and disables submit even with a category picked', () => {
        renderSheet({ isOffline: true });

        // the offline status note is visible (role=status, localized copy)
        expect(screen.getByRole('status')).toHaveTextContent('offline');

        // pick a category — the button must STILL be disabled while offline
        fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
        expect(
            (screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        // and the guard never fired the mutation
        expect(baseProps.onSubmit).not.toHaveBeenCalled();
    });

    it('RDR-10: online (default) keeps submit enabled once a category is picked and hides the note', () => {
        renderSheet({});
        expect(screen.queryByRole('status')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
        expect(
            (screen.getByRole('button', { name: 'Submit report' }) as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    });
});
