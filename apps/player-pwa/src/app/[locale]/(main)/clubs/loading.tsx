// Route skeleton (P2-138): search pill + venue cards.
export default function ClubsLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse pt-4">
      <div className="mx-4 mb-3 h-12 rounded-full bg-gray-200" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 overflow-hidden rounded-2xl bg-white shadow-card">
          <div className="h-24 w-full bg-gray-200" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 rounded bg-gray-200" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
