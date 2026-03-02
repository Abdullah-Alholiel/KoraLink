'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error-reporting service in production
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg p-8 text-center">
      <h2 className="text-2xl font-bold text-brand-red">حدث خطأ ما</h2>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-green px-6 py-2 text-white"
      >
        حاول مجدداً
      </button>
    </div>
  );
}
