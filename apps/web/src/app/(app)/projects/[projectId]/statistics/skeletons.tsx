import { Card } from "@radix-ui/themes";

function Bar({ className }: Readonly<{ className: string }>) {
  return <div className={`bg-surface-2 animate-pulse rounded-sm ${className}`} />;
}

/** Placeholder for one chart card while its data loads: a title line and the chart's area. */
export function ChartSkeleton({
  height,
  className = "",
}: Readonly<{ height: number; className?: string }>) {
  return (
    <Card size="3" className={`border-line bg-surface mb-3.5 border ${className}`}>
      <Bar className="mb-3.5 h-3 w-48" />
      <div className="bg-surface-2 animate-pulse rounded-md" style={{ height }} />
    </Card>
  );
}

/** The overview card's tiles (project-summary-card.tsx). */
export function SummarySkeleton() {
  return (
    <Card size="3" className="border-line bg-surface mb-3.5 border">
      <Bar className="mb-3.5 h-3 w-48" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="border-line rounded-md border px-4 py-3">
            <Bar className="mb-2 h-2.5 w-20" />
            <Bar className="mb-1.5 h-6 w-24" />
            <Bar className="h-2.5 w-32" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The charts built from the project overview (phase progress, trends, Greens, damage). */
export function OverviewSkeleton() {
  return (
    <>
      <ChartSkeleton height={300} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartSkeleton height={240} />
        <ChartSkeleton height={240} />
      </div>
      <ChartSkeleton height={240} />
    </>
  );
}

/** The failed-mechanics table and the per-phase chart. */
export function FailedMechanicsSkeleton() {
  return (
    <div className="mt-3.5">
      <ChartSkeleton height={220} />
      <ChartSkeleton height={420} />
    </div>
  );
}
