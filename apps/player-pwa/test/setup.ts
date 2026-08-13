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
