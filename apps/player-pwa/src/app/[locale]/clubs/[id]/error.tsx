'use client';

import RouteError from '@/components/layout/RouteError';

// Route-scoped error boundary (P2-180). clubs/[id] is a standalone route
// OUTSIDE (main) — the (main)/layout surface boundary never covers it, so a
// render-throw deep-link previously fell to the [locale] root boundary and
// lost all chrome. RouteError reports via captureError and renders classified
// copy (errorKey(classifyError(error))).
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
