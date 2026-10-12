import { ProjectRole } from "@voidlog/db";
import { Table } from "@radix-ui/themes";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PhaseBadge } from "@/components/phase-badge";
import { loadProjectOverview } from "@/lib/project-overview";
import { hasRole, requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { DeleteProjectButton } from "./delete-project-button";
import { PhaseProgressTrend } from "./phase-progress-trend";

export default async function ProjectDetailPage(
  props: Readonly<PageProps<"/projects/[projectId]">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("project");
  const tCommon = await getTranslations("common");
  const tSidebar = await getTranslations("sidebar");

  // History page: the logs and one simple progress chart. The in-depth
  // charts (damage per phase, mechanic trends) live on the statistics page.
  const { batches, progressBossId, progressPhaseNames, progressNights } = await loadProjectOverview(
    projectId,
    locale,
    false,
  );

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[{ label: tSidebar("projects"), href: "/" }, { label: membership.project.name }]}
      />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-heading text-foreground-strong text-2xl font-bold">
            {membership.project.name}
          </h1>
          <p className="text-muted mt-1 text-sm">
            {t("raidNightsTracked", { count: batches.length })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasRole(membership.role, ProjectRole.CONTRIBUTOR) ? (
            <Link
              href={`/projects/${projectId}/batches/new`}
              className="bg-primary text-primary-foreground inline-flex h-8 items-center justify-center rounded-sm px-3.5 text-sm font-semibold"
            >
              {t("uploadBatch")}
            </Link>
          ) : null}
          {membership.role === ProjectRole.ADMIN ? (
            <DeleteProjectButton projectId={projectId} projectName={membership.project.name} />
          ) : null}
        </div>
      </div>

      {progressBossId && progressPhaseNames && progressNights.length > 0 ? (
        <PhaseProgressTrend
          bossId={progressBossId}
          phases={progressPhaseNames.map((name, order) => ({ name, order }))}
          nights={progressNights}
        />
      ) : null}

      <div className="text-muted-strong mb-2.5 text-sm font-semibold">{t("raidNights")}</div>
      <Table.Root variant="surface" className="border-line bg-surface border">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{t("table.raidNight")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("table.attempts")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("table.kills")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("table.greensMissed")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell title={t("table.shockwavesHitHint")}>
              {t("table.shockwavesHit")}
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("table.furthestPhase")}</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {batches.map((batch) => (
            <Table.Row key={batch.id}>
              <Table.Cell>
                <Link
                  href={`/projects/${projectId}/batches/${batch.id}`}
                  className="text-foreground font-semibold hover:underline"
                >
                  {batch.label}
                </Link>
              </Table.Cell>
              <Table.Cell className="text-muted-strong">{batch.attempts}</Table.Cell>
              <Table.Cell className="text-muted-strong">{batch.kills}</Table.Cell>
              <Table.Cell className="text-danger font-semibold">
                {batch.greenFailRate === null ? tCommon("dash") : `${batch.greenFailRate}%`}
              </Table.Cell>
              <Table.Cell className="text-warning font-semibold">
                {batch.shockwaveHitRate === null ? tCommon("dash") : `${batch.shockwaveHitRate}%`}
              </Table.Cell>
              <Table.Cell>
                {batch.furthestPhase ? (
                  <PhaseBadge
                    bossId={batch.furthestPhase.bossId}
                    name={batch.furthestPhase.name}
                    order={batch.furthestPhase.order}
                  />
                ) : (
                  tCommon("dash")
                )}
              </Table.Cell>
            </Table.Row>
          ))}
          {batches.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={6} className="text-muted">
                {t("empty")}
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </div>
  );
}
