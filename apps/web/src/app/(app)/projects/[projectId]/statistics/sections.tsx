import { Card } from "@radix-ui/themes";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { ChompsChartCard } from "@/components/chomps-chart";
import { FailedMechanicsCard } from "@/components/failed-mechanics-table";
import { loadProjectFailedMechanics } from "@/lib/failed-mechanics";
import { assignableRoles, loadBossIds } from "@/lib/player-roles";
import { loadProjectOverview } from "@/lib/project-overview";
import { loadProjectSummary } from "@/lib/project-summary";
import { formatDate } from "@/lib/utils";
import { DpsPhaseChart } from "../dps-phase-chart";
import { FailedMechanicByPhase } from "../failed-mechanic-by-phase";
import { GreensByRole } from "../greens-by-role";
import { PhaseProgressTrend } from "../phase-progress-trend";
import { ProjectSummaryCard } from "../project-summary-card";
import { GreenFailTrendChart, ShockwaveTrendChart } from "../trend-chart";

// The statistics page's sections, each loading its own data so the page can
// stream them in one by one behind their own <Suspense> skeletons
// (skeletons.tsx) instead of waiting for the slowest.

export async function SummarySection({ projectId }: Readonly<{ projectId: string }>) {
  const summary = await loadProjectSummary(projectId);
  return summary.attempts > 0 ? <ProjectSummaryCard summary={summary} /> : null;
}

export async function OverviewSection({
  projectId,
  locale,
}: Readonly<{ projectId: string; locale: Locale }>) {
  const t = await getTranslations("statistics");
  const tProject = await getTranslations("project");
  const tChomps = await getTranslations("chomps");
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
    <>
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
    </>
  );
}

export async function FailedMechanicsSection({
  projectId,
  locale,
}: Readonly<{ projectId: string; locale: Locale }>) {
  const [failed, bossIds] = await Promise.all([
    loadProjectFailedMechanics(projectId, locale),
    loadBossIds({ projectId }),
  ]);
  return (
    <>
      {failed.all.attempts > 0 ? (
        <div className="mt-3.5">
          <FailedMechanicsCard
            scope="project"
            all={failed.all}
            byRole={failed.byRole}
            roles={assignableRoles(bossIds)}
          />
        </div>
      ) : null}

      {failed.byPhase.length > 0 ? <FailedMechanicByPhase phases={failed.byPhase} /> : null}
    </>
  );
}
