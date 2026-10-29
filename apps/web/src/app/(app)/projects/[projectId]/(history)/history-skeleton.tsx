import { ChartSkeleton, SkeletonBar } from "@/components/chart-skeleton";
import { TableSkeleton } from "@/components/table-skeleton";

/** The progress chart and the raid-night table while HistorySection loads. */
export function HistorySkeleton() {
  return (
    <>
      <ChartSkeleton height={300} />
      <SkeletonBar className="mb-2.5 h-3.5 w-28" />
      <TableSkeleton columns={6} rows={8} />
    </>
  );
}
