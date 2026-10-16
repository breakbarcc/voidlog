import { Card } from "@radix-ui/themes";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ChompsChartCard } from "@/components/chomps-chart";
import { loadProjectOverview } from "@/lib/project-overview";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { DpsPhaseChart } from "../dps-phase-chart";
import { GreensByRole } from "../greens-by-role";
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
  const tChomps = await getTranslations("chomps");
  const tSidebar = await getTranslations("sidebar");

  const {
    allTrendPoints,
    greenCircles,
    progressBossId,
    progressPhaseNames,
    progressNights,
    dpsPhaseNames,
    dpsNights,
  } = await loadProjectOverview(projectId, locale, true);

  // One point per night, average kills per attempt that reached Primordus's
  // attacks (nights without such an attempt leave a gap).
  const chompPoints = allTrendPoints.map((b) => ({
    label: formatDate(b.occurredAt, locale, { day: "2-digit", month: "2-digit" }),
    slam: b.chompAttempts > 0 ? Math.round((b.chompSlam / b.chompAttempts) * 100) / 100 : null,
    jaws: b.chompAttempts > 0 ? Math.round((b.chompJaws / b.chompAttempts) * 100) / 100 : null,
    reached: b.chompAttempts,
    attemptsSlam: b.chompAttemptsSlam,
    attemptsAny: b.chompAttemptsAny,
  }));

  const hasContent =
    allTrendPoints.length >= 2 ||
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

      {allTrendPoints.length >= 2 ? (
        <>
          <div className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card size="3" className="border-line bg-surface border">
              <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
                {tProject("shockwaveRateAll", { count: allTrendPoints.length })}
              </div>
              <ShockwaveTrendChart points={allTrendPoints} />
            </Card>
            {chompPoints.some((p) => p.slam !== null) ? (
              <ChompsChartCard title={tChomps("squadTitle")} points={chompPoints} unit="average" />
            ) : null}
          </div>
          <Card size="3" className="border-line bg-surface mb-3.5 border">
            <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
              {tProject("greenFailRateAll", { count: allTrendPoints.length })}
            </div>
            <GreenFailTrendChart points={allTrendPoints} />
          </Card>
        </>
      ) : null}

      {progressBossId ? <GreensByRole bossId={progressBossId} circles={greenCircles} /> : null}

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
