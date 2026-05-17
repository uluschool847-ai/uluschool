export default function Loading() {
  return (
    <div className="p-8 space-y-12 max-w-5xl mx-auto animate-pulse">
      <div className="h-10 w-48 bg-gray-200 rounded" />
      <div className="grid gap-6">
        <div data-testid="loading-skeleton-schedule" className="h-32 bg-gray-100 rounded-xl" />
        <div data-testid="loading-skeleton-homework" className="h-40 bg-gray-100 rounded-xl" />
        <div data-testid="loading-skeleton-grades" className="h-32 bg-gray-100 rounded-xl" />
        <div data-testid="loading-skeleton-progress" className="h-24 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}
