import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — mock it so components that auto-scroll
// (ChatSheet, etc.) don't crash in tests.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement URL.canParse (used by socket.io-client in some versions)
if (typeof URL !== 'undefined' && !URL.canParse) {
  URL.canParse = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };
}

// jsdom doesn't implement matchMedia — PromoBillboard's prefers-reduced-motion
// check (and any future hook) needs it. Default: no reduced motion.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as unknown as typeof window.matchMedia;
}

// jsdom doesn't implement IntersectionObserver — the Play page's sticky
// sentinel (pinned search/calendar header) observes one on mount.
if (typeof IntersectionObserver === 'undefined') {
  class FakeIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver =
    FakeIntersectionObserver;
}
