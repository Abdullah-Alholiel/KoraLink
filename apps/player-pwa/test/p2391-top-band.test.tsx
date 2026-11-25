import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { render, cleanup } from '@testing-library/react';
import { LocationProvider } from '@/providers/LocationProvider';
import Toast from '@/components/layout/Toast';
import { useAppStore } from '@/store/useAppStore';

// next-intl: return keys as-is (no provider needed for these assertions)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

// Minimal ResizeObserver stub — the component degrades to write-once without
// it, but the tripwire pins the live observe/disconnect wiring.
const observe = vi.fn();
const disconnect = vi.fn();
class ROStub {
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
}
vi.stubGlobal('ResizeObserver', ROStub);

// jsdom has no navigator.geolocation → useGeolocation flips status to
// 'unsupported' in its mount effect and the pill never renders. Add the
// property IN PLACE (PR-Agent #298 r4: spreading globalThis.navigator into a
// plain object would REPLACE the global and lose jsdom's prototype-defined
// getters — userAgent/language/platform would read undefined for every test
// in this file). defineProperty keeps the whole prototype intact.
Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: { getCurrentPosition: vi.fn() },
  configurable: true,
});

const PWA_ROOT = path.resolve(__dirname, '..', 'src');

describe('P2-391 top-band slot contract', () => {
  const setSpy = vi.spyOn(document.documentElement.style, 'setProperty');

  beforeEach(() => {
    observe.mockClear();
    disconnect.mockClear();
    setSpy.mockClear();
    document.documentElement.style.removeProperty('--top-banner-h');
    useAppStore.setState({
      isAuthenticated: true,
      user: {
        id: 'user-me',
        fullName: 'Me',
        handle: 'me',
        avatarUrl: '',
        phone: '+9665' + '0'.repeat(7) + '1',
      } as never,
      toast: null,
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('--top-banner-h');
    useAppStore.setState({ isAuthenticated: false, user: null, toast: null });
  });

  it('P391-1: pill writes its viewport extent into --top-banner-h on mount', () => {
    render(<LocationProvider>{<div />}</LocationProvider>);
    // jsdom geometry is 0 → extent '0px'; the CONTRACT is that the var is
    // written through documentElement.style (real browsers write NNpx).
    expect(setSpy).toHaveBeenCalledWith('--top-banner-h', '0px');
  });

  it('P391-2: pill measures via ResizeObserver and resets the var on unmount', () => {
    const { unmount } = render(<LocationProvider>{<div />}</LocationProvider>);
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith('--top-banner-h', '0px');
  });

  it('P391-3: pill sits in the z-[46] band slot (below toasts, above content)', () => {
    const { container } = render(<LocationProvider>{<div />}</LocationProvider>);
    const host = container.querySelector('.fixed.inset-x-0.top-0');
    expect(host).not.toBeNull();
    expect(host!.className).toContain('z-[46]');
    expect(host!.className).not.toContain('z-[80]');
  });

  it('P391-4: Toast floats in the z-[100] band slot positioned by --top-band-top', () => {
    useAppStore.setState({
      toast: { id: 't1', message: 'hello', type: 'info' },
    });
    const { container } = render(<Toast />);
    const host = container.querySelector('.fixed.inset-x-0');
    expect(host).not.toBeNull();
    expect(host!.className).toContain('z-[100]');
    expect(host!.className).toContain('top-[var(--top-band-top)]');
    // MINOR-4 regression pin: no raw safe-area / 1.5rem drift — the band var
    // is the ONLY vertical anchor.
    expect(host!.className).not.toContain('safe-area-inset-top');
    expect(host!.className).not.toContain('1.5rem');
  });

  it('P391-5: globals.css carries the slot contract (defaults + alias + shell reservation)', () => {
    const css = fs.readFileSync(
      path.join(PWA_ROOT, 'styles', 'globals.css'),
      'utf8',
    );
    expect(css).toContain('--top-banner-h: 0px');
    expect(css).toMatch(/--top-band-top:\s*max\(var\(--top-banner-h\),\s*var\(--top-safe-inset\)\)/);
    // shell reservation — content shifts down while a banner is mounted
    expect(css).toMatch(/\.app-shell\s*{[^}]*padding-top:\s*var\(--top-banner-h/);
  });

  it('P391-6: z-ladder documented in globals.css — pill z-[46]; Toast stacks positionally (no phantom rung)', () => {
    const css = fs.readFileSync(
      path.join(PWA_ROOT, 'styles', 'globals.css'),
      'utf8',
    );
    expect(css).toContain('P2-391 Overlay z-ladder');
    expect(css).toContain('z-[46]');
    // PR-Agent #298 r2: no phantom z-[47] rung — Toast stacking is positional
    // (the band var), not z-based; the ladder must not list a rung nothing uses.
    expect(css).not.toContain('z-[47]');
  });

  it('P391-7: MobileFrame subtracts the reserved row so the nav never clips', () => {
    const src = fs.readFileSync(
      path.join(PWA_ROOT, 'components', 'layout', 'MobileFrame.tsx'),
      'utf8',
    );
    expect(src).toContain('h-[calc(var(--app-height)-var(--top-banner-h,0px))]');
    // both boxes (outer + inner) carry the calc
    expect(src.match(/top-banner-h,0px/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
