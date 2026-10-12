import { Card } from "@radix-ui/themes";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { loadProjectOverview } from "@/lib/project-overview";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { DpsPhaseChart } from "../dps-phase-chart";
import { PhaseProgressTrend } from "../phase-progress-trend";
import { GreenFailTrendChart, ShockwaveTrendChart } from "../trend-chart";

/**
 * Statistics: every chart of the project in one place, in depth. The
 * history page (`../page.tsx`) keeps only the logs and one simple progress
 * chart.
 */
export default async function ProjectStatisticsPage(
  props: Readonly<PageProps<"/projects/[projectId]/statistics">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("statistics");
  const tProject = await getTranslations("project");
  const tSidebar = await getTranslations("sidebar");

  const {
    trendPoints,
    progressBossId,
    progressPhaseNames,
    progressNights,
    dpsPhaseNames,
    dpsNights,
  } = await loadProjectOverview(projectId, locale, true);

  const hasContent =
    trendPoints.length >= 2 ||
    (progressBossId && dpsPhaseNames && dpsNights.length > 0) ||
    (progressBossId && progressPhaseNames && progressNights.length > 0);

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

      {progressBossId && progressPhaseNames && progressNights.length > 0 ? (
        <PhaseProgressTrend
          bossId={progressBossId}
          phases={progressPhaseNames.map((name, order) => ({ name, order }))}
          nights={progressNights}
        />
      ) : null}

      {trendPoints.length >= 2 ? (
        <div className="mb-6 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <Card size="3" className="border-line bg-surface border">
            <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
              {tProject("greenFailRate", { count: trendPoints.length })}
            </div>
            <GreenFailTrendChart points={trendPoints} />
          </Card>
          <Card size="3" className="border-line bg-surface border">
            <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
              {tProject("shockwaveRate", { count: trendPoints.length })}
            </div>
            <ShockwaveTrendChart points={trendPoints} />
          </Card>
        </div>
      ) : null}

      {progressBossId && dpsPhaseNames && dpsNights.length > 0 ? (
        <DpsPhaseChart
          bossId={progressBossId}
          phases={dpsPhaseNames.map((name, order) => ({ name, order }))}
          nights={dpsNights}
        />
      ) : null}

      {hasContent ? null : <p className="text-muted text-sm">{t("empty")}</p>}
    </div>
  );
}
