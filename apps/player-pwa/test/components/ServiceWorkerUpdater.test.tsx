import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// ── Mocks (before importing the component) ──────────────────────────

const mockCaptureError = vi.fn();
vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...(args as [unknown, unknown])),
}));

const mockRegister = vi.fn<() => Promise<unknown>>();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

// ServiceWorkerUpdater renders nothing and only talks to navigator.serviceWorker.
type SWStub = {
  register: () => Promise<unknown>;
  addEventListener: () => void;
  removeEventListener: () => void;
  ready: Promise<never>;
};

import ServiceWorkerUpdater from '@/components/auth/ServiceWorkerUpdater';

function setServiceWorker(sw: SWStub | undefined) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: sw,
  });
}

describe('ServiceWorkerUpdater (P2-60 registration ownership)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue({});
  });

  it('SWU-1: registers /sw.js at scope / when supported', async () => {
    setServiceWorker({
      register: mockRegister,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      ready: Promise.reject(new Error('skip ready path')),
    });

    render(<ServiceWorkerUpdater />);

    expect(mockRegister).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('SWU-2: a rejected register() is captured via captureError — never an unhandled rejection', async () => {
    const boom = new DOMException('blocked by CSP', 'SecurityError');
    mockRegister.mockRejectedValue(boom);
    setServiceWorker({
      register: mockRegister,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      ready: new Promise(() => {}), // pending forever — isolation
    });

    render(<ServiceWorkerUpdater />);

    // Flush the promise chain.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError.mock.calls[0][0]).toBe(boom);
    expect((mockCaptureError.mock.calls[0][1] as { scope: string }).scope).toBe('swRegister');
  });

  it('SWU-3: no serviceWorker support → no registration attempted', () => {
    setServiceWorker(undefined);

    render(<ServiceWorkerUpdater />);

    expect(mockRegister).not.toHaveBeenCalled();
  });
});
