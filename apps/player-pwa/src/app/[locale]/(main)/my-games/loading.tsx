// Route skeleton (P2-138): tab pills + game cards.
export default function MyGamesLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse pt-4">
      <div className="mx-4 mb-3 flex gap-2">
        <div className="h-10 flex-1 rounded-full bg-gray-200" />
        <div className="h-10 flex-1 rounded-full bg-gray-100" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-4 h-9 w-full rounded-full bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
