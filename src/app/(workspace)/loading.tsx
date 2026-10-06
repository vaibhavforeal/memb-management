export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="space-y-4">
      <div className="h-9 w-52 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-card" />
    </div>
  );
}
