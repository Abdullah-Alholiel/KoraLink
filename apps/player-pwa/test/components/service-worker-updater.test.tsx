/**
 * P2-126 (run #89) — consent-gated service-worker activation.
 * A waiting worker is only activated (SKIP_WAITING) after the user taps
 * "Reload now"; first installs activate silently with no banner; reloads
 * only follow consent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => 'en',
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
}));

import ServiceWorkerUpdater from '@/components/auth/ServiceWorkerUpdater';

type Listener = () => void;

interface StubReg {
  waiting: { postMessage: ReturnType<typeof vi.fn>; scriptURL: string } | null;
  installing: null;
  addEventListener: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

let reg: StubReg;
let controllerChangeHandlers: Listener[];
const reloadMock = vi.fn();
const originalLocation = window.location;

function installServiceWorker({ controller, waiting = true }: { controller: boolean; waiting?: boolean }) {
  reg = {
    waiting: waiting ? { postMessage: vi.fn(), scriptURL: '/sw.js' } : null,
    installing: null,
    addEventListener: vi.fn(),
    update: vi.fn(() => Promise.resolve()),
  };
  controllerChangeHandlers = [];
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(() => Promise.resolve(reg)),
      ready: Promise.resolve(reg),
      controller: controller ? {} : null,
      addEventListener: vi.fn((type: string, fn: Listener) => {
        if (type === 'controllerchange') controllerChangeHandlers.push(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: Listener) => {
        if (type === 'controllerchange') {
          controllerChangeHandlers = controllerChangeHandlers.filter((h) => h !== fn);
        }
      }),
    },
  });
}

function fireControllerChange() {
  act(() => {
    controllerChangeHandlers.forEach((h) => h());
  });
}

async function renderAndSettle() {
  const utils = render(<ServiceWorkerUpdater />);
  // Flush ready.then + Portal mount effect.
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
  return utils;
}

describe('ServiceWorkerUpdater — consent-gated activation (P2-126)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('(a) shows the update banner when a worker is waiting and the page is controlled', async () => {
    installServiceWorker({ controller: true });
    await renderAndSettle();

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.className).toContain('z-[60]');
    expect(screen.getByText('pwa.updateReadyTitle')).toBeInTheDocument();
    expect(screen.getByText('pwa.updateReadyBody')).toBeInTheDocument();
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled();
  });

  it('(b) stays hidden when no worker is waiting', async () => {
    installServiceWorker({ controller: true, waiting: false });
    await renderAndSettle();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('(c) "Reload now" posts SKIP_WAITING exactly once and marks consent', async () => {
    installServiceWorker({ controller: true });
    await renderAndSettle();

    fireEvent.click(screen.getByText('pwa.updateReload'));

    expect(reg.waiting!.postMessage).toHaveBeenCalledTimes(1);
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(screen.queryByRole('status')).toBeNull();
    // Consent observable: the subsequent controllerchange reloads.
    fireControllerChange();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('(d) "Later" hides the banner and sets the sessionStorage flag', async () => {
    installServiceWorker({ controller: true });
    await renderAndSettle();

    fireEvent.click(screen.getByText('pwa.updateLater'));

    expect(screen.queryByRole('status')).toBeNull();
    expect(window.sessionStorage.getItem('swUpdateDismissed')).toBe('/sw.js');
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled();
  });

  it('(e) dismissal persists across remount', async () => {
    installServiceWorker({ controller: true });
    const first = await renderAndSettle();
    fireEvent.click(screen.getByText('pwa.updateLater'));
    first.unmount();

    installServiceWorker({ controller: true });
    await renderAndSettle();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('(f) first install (waiting, no controller) auto-posts SKIP_WAITING with NO banner', async () => {
    installServiceWorker({ controller: false });
    await renderAndSettle();

    expect(reg.waiting!.postMessage).toHaveBeenCalledTimes(1);
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('(f2) a plain first claim (no controller at load) does NOT reload', async () => {
    installServiceWorker({ controller: false });
    await renderAndSettle();

    fireControllerChange();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('(g) after the consented postMessage, controllerchange reloads exactly once', async () => {
    installServiceWorker({ controller: true });
    await renderAndSettle();

    fireEvent.click(screen.getByText('pwa.updateReload'));
    fireControllerChange();
    fireControllerChange();

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('(h) controllerchange WITHOUT consent on an already-controlled page does not reload', async () => {
    installServiceWorker({ controller: true });
    await renderAndSettle();

    fireControllerChange();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
