import { SkeletonBar } from "@/components/chart-skeleton";
import { HistorySkeleton } from "./history-skeleton";

/**
 * Shown the moment a link to the log history is clicked (and prefetched
 * with it), until the page's membership check and heading are rendered —
 * then the page's own skeleton takes over (page.tsx).
 */
export default function ProjectLoading() {
  return (
    <div className="px-10 py-8">
      <SkeletonBar className="mb-4 h-3 w-40" />
      <div className="mb-6">
        <SkeletonBar className="mb-2 h-7 w-64" />
        <SkeletonBar className="h-3.5 w-40" />
      </div>
      <HistorySkeleton />
    </div>
  );
}
