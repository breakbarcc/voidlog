import { getTranslations } from "next-intl/server";
import { FailedMechanicsSkeleton, OverviewSkeleton, SummarySkeleton } from "./skeletons";

/**
 * Shown the moment a link to the statistics page is clicked (and prefetched
 * with it), until the page's membership check and heading are rendered —
 * then the page's own section skeletons take over (page.tsx).
 */
export default async function StatisticsLoading() {
  const t = await getTranslations("statistics");
  return (
    <div className="px-10 py-8">
      <div className="bg-surface-2 mb-4 h-3 w-56 animate-pulse rounded-sm" />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mb-6 mt-1 text-sm">{t("subtitle")}</p>
      <SummarySkeleton />
      <OverviewSkeleton />
      <FailedMechanicsSkeleton />
    </div>
  );
}
