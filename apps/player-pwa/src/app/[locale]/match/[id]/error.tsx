'use client';

import RouteError from '@/components/layout/RouteError';

// Route-scoped error boundary (P2-138). RouteError reports via captureError
// and renders classified copy (errorKey(classifyError(error))).
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
