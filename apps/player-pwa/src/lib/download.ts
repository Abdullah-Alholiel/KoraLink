/**
 * Tiny browser download helper. Converts a JSON object to a Blob and
 * triggers a download with the given filename. Used by the PDPL
 * data-export flow (P0-6, run #29).
 *
 * No deps; uses the standard URL.createObjectURL + a.click() pattern.
 * Safe to call on the client only (no-op server-side).
 */
export function downloadJsonAsFile(data: unknown, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the click has time to dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
