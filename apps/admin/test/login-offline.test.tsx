import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import arJson from '@/messages/ar.json';
import LoginPage from '@/app/login/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Msgs = Record<string, Record<string, unknown>>;
const enM = en as unknown as Msgs;
const arM = arJson as unknown as Msgs;
const hq = enM.hq as Record<string, string>;

let onLine = true;

function setOnline(value: boolean) {
  onLine = value;
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

function renderLogin() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      onError={(err) => {
        // Pre-existing dotted message keys trip INVALID_KEY (app-wide, not
        // login-specific); any other intl error (e.g. MISSING_MESSAGE for
        // the new hq keys) must fail the test.
        if (err.code !== 'INVALID_KEY') throw err;
      }}
    >
      <LoginPage />
    </NextIntlClientProvider>,
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const failIfCalled = vi.fn(() => {
  throw new Error('fetch must NOT be called while offline');
});

beforeEach(() => {
  onLine = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => onLine);
  failIfCalled.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('login page offline gating (P2-408)', () => {
  it('offline: dev-login + send-otp buttons are disabled, notice shown, no fetch fired', () => {
    onLine = false;
    vi.stubGlobal('fetch', failIfCalled);
    renderLogin();

    const dev = screen.getByRole('button', { name: /sign in \(dev\)/i });
    const send = screen.getByRole('button', { name: /send otp/i });
    expect((dev as HTMLButtonElement).disabled).toBe(true);
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(dev);
    fireEvent.click(send);

    expect(screen.getByRole('alert').textContent).toBe(hq.offlineNotice);
    expect(failIfCalled).not.toHaveBeenCalled();
  });

  it('offline after OTP sent: verify button disabled, notice shown, no fetch; clears on reconnect', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    renderLogin();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    });

    const verify = await screen.findByRole('button', { name: /verify & sign in/i });
    expect((verify as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();

    vi.stubGlobal('fetch', failIfCalled);
    setOnline(false);

    expect((verify as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(verify);
    expect(screen.getByRole('alert').textContent).toBe(hq.offlineNotice);
    expect(failIfCalled).not.toHaveBeenCalled();

    // Computed, not latched: reconnecting clears the notice and re-enables.
    setOnline(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((verify as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('login page localization (P2-408)', () => {
  const src = readFileSync(resolve(__dirname, '../src/app/login/page.tsx'), 'utf8');

  it('no longer hardcodes the player-redirect or no-token EN literals', () => {
    expect(src).not.toContain('This console is for admins and venue owners only');
    expect(src).not.toContain('OTP verified but no token returned');
    expect(src).toContain("t('playerRedirect')");
    expect(src).toContain("t('otpNoToken')");
  });

  it.each(['offlineNotice', 'playerRedirect', 'otpNoToken'])(
    'hq.%s exists (non-empty) in en and ar',
    (key) => {
      const e = (enM.hq as Record<string, unknown>)[key];
      const a = (arM.hq as Record<string, unknown>)[key];
      expect(typeof e).toBe('string');
      expect(typeof a).toBe('string');
      expect((e as string).length).toBeGreaterThan(0);
      expect((a as string).length).toBeGreaterThan(0);
      expect(a).not.toBe(e);
    },
  );
});
