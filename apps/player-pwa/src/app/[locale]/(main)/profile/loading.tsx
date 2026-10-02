// Route skeleton (P2-138): avatar + name lines + menu rows.
export default function ProfileLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse pt-6">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-gray-200" />
        <div className="h-5 w-40 rounded bg-gray-200" />
        <div className="h-3 w-24 rounded bg-gray-100" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 flex h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-card">
          <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
