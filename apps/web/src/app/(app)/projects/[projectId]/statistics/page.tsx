import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { FailedMechanicsSection, OverviewSection, SummarySection } from "./sections";
import { FailedMechanicsSkeleton, OverviewSkeleton, SummarySkeleton } from "./skeletons";

/**
 * Statistics: every chart of the project in one place, in depth. The
 * history page (`../page.tsx`) keeps only the logs and one simple progress
 * chart.
 *
 * Only the membership check and the heading are awaited here; the charts
 * load their data in their own sections (sections.tsx), all at once, and
 * stream in behind skeletons as each one is ready.
 */
export default async function ProjectStatisticsPage(
  props: Readonly<PageProps<"/projects/[projectId]/statistics">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("statistics");
  const tSidebar = await getTranslations("sidebar");

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: t("breadcrumb") },
        ]}
      />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mb-6 mt-1 text-sm">{t("subtitle")}</p>

      <Suspense fallback={<SummarySkeleton />}>
        <SummarySection projectId={projectId} />
      </Suspense>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewSection projectId={projectId} locale={locale} />
      </Suspense>
      <Suspense fallback={<FailedMechanicsSkeleton />}>
        <FailedMechanicsSection projectId={projectId} locale={locale} />
      </Suspense>
    </div>
  );
}
