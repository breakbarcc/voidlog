import { Card } from "@radix-ui/themes";

/** One pulsing placeholder line; size it with `className`. */
export function SkeletonBar({ className }: Readonly<{ className: string }>) {
  return <div className={`bg-surface-2 animate-pulse rounded-sm ${className}`} />;
}

/** Placeholder for one chart card while its data loads: a title line and the chart's area. */
export function ChartSkeleton({
  height,
  className = "",
}: Readonly<{ height: number; className?: string }>) {
  return (
    <Card size="3" className={`border-line bg-surface mb-3.5 border ${className}`}>
      <SkeletonBar className="mb-3.5 h-3 w-48" />
      <div className="bg-surface-2 animate-pulse rounded-md" style={{ height }} />
    </Card>
  );
}
