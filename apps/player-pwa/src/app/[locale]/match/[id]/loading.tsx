// Route skeleton (P2-138): hero block + bottom sheet + CTA bar.
export default function MatchLoading() {
  return (
    <div role="status" aria-label="Loading" className="min-h-dvh animate-pulse bg-brand-bg">
      <div className="h-56 w-full bg-gray-200" />
      <div className="-mt-6 rounded-t-3xl bg-white p-5">
        <div className="mb-5 h-6 w-2/3 rounded bg-gray-200" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mb-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
          </div>
        ))}
        <div className="mt-6 h-12 w-full rounded-2xl bg-gray-200" />
      </div>
    </div>
  );
}
