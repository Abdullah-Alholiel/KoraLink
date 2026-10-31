/**
 * RealtimeBanner specs (run #104 — Reviewer B P0: silent reconnect).
 *
 * Contract:
 *  1. Renders NOTHING while the /lobby socket is connected.
 *  2. Shows the localized "live updates paused" strip on `disconnect` AND on
 *     `connect_error` (role="status").
 *  3. HIDES the strip again on `connect` (reconnected).
 *  4. Releases its consumer ref on unmount (ref-counted client contract).
 *
 * The shared RealtimeClient is stubbed at the module boundary — these specs
 * pin the COMPONENT's subscription behavior, not socket.io.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
const connectMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock('@/lib/realtime', () => ({
    getRealtime: () => ({
        connect: connectMock,
        disconnect: disconnectMock,
        on: (event: string, handler: Handler) => {
            let set = handlers.get(event);
            if (!set) {
                set = new Set();
                handlers.set(event, set);
            }
            set.add(handler);
            return () => {
                set.delete(handler);
            };
        },
    }),
}));

import RealtimeBanner from '@/components/layout/RealtimeBanner';

function emit(event: string, payload: unknown = undefined) {
    handlers.get(event)?.forEach((h) => act(() => h(payload)));
}

function renderBanner() {
    return render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <RealtimeBanner />
        </NextIntlClientProvider>,
    );
}

describe('RealtimeBanner (run #104 reconnect visibility)', () => {
    beforeEach(() => {
        handlers.clear();
        connectMock.mockClear();
        disconnectMock.mockClear();
    });

    it('renders nothing while connected, and acquires a consumer ref on mount', () => {
        const { container } = renderBanner();
        expect(connectMock).toHaveBeenCalledTimes(1);
        expect(container.textContent).toBe('');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows the localized paused strip on disconnect', () => {
        renderBanner();
        emit('disconnect', 'transport close');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Live updates paused — reconnecting…',
        );
    });

    it('shows the paused strip on connect_error too', () => {
        renderBanner();
        emit('connect_error', 'websocket error');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Live updates paused — reconnecting…',
        );
    });

    it('hides the strip on reconnect (connect)', () => {
        renderBanner();
        emit('disconnect', 'ping timeout');
        expect(screen.getByRole('status')).toBeInTheDocument();
        emit('connect');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('releases the consumer ref on unmount', () => {
        const { unmount } = renderBanner();
        unmount();
        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
});
