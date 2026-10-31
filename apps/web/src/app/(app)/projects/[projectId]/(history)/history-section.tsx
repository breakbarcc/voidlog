import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Table } from "@radix-ui/themes";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { PhaseBadge } from "@/components/phase-badge";
import { loadProjectOverview } from "@/lib/project-overview";
import { loadBatchRoleIssues, type BatchRoleIssues } from "@/lib/role-composition";
import { PhaseProgressTrend } from "../phase-progress-trend";

// Distinct deviation sets listed in a flagged row's tooltip before "and N more".
const SHOWN_DEVIATIONS = 3;

/**
 * The log history page's data part: the progress chart and the raid-night
 * table. Loaded on its own, so the page can show its heading at once and
 * stream this in behind a skeleton (page.tsx).
 */
export async function HistorySection({
  projectId,
  locale,
}: Readonly<{ projectId: string; locale: Locale }>) {
  const t = await getTranslations("project");
  const tCommon = await getTranslations("common");
  // History page: the logs and one simple progress chart. The in-depth
  // charts (damage per phase, mechanic trends) live on the statistics page.
  const [{ batches, progressBossId, progressPhaseNames, progressNights }, roleIssues] =
    await Promise.all([
      loadProjectOverview(projectId, locale, false),
      loadBatchRoleIssues(projectId),
    ]);

  // "Rollen passen in 3 von 12 Versuchen nicht" plus one line per way they don't.
  const roleIssueText = (issues: BatchRoleIssues) =>
    [
      t("roleIssues.title", {
        mismatched: issues.mismatched,
        attempts: issues.attempts,
        expected: [
          ...Object.entries(issues.composition.counts).map(([role, count]) => `${count}× ${role}`),
          t("roleIssues.fill", { role: issues.composition.fill }),
        ].join(", "),
      }),
      ...issues.deviations.slice(0, SHOWN_DEVIATIONS).map((deviations) =>
        deviations
          .map((d) =>
            d.role === null
              ? t("roleIssues.unassigned", { count: d.actual })
              : t("roleIssues.deviation", {
                  role: d.role,
                  actual: d.actual,
                  expected: d.expected,
                }),
          )
          .join(", "),
      ),
      ...(issues.deviations.length > SHOWN_DEVIATIONS
        ? [t("roleIssues.more", { count: issues.deviations.length - SHOWN_DEVIATIONS })]
        : []),
    ].join("\n");

  return (
    <>
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
          {batches.map((batch) => {
            const issues = roleIssues.get(batch.id);
            return (
              <Table.Row key={batch.id} className={issues ? "bg-warning/5" : undefined}>
                <Table.Cell>
                  <span className="inline-flex items-center gap-2">
                    <Link
                      href={`/projects/${projectId}/batches/${batch.id}`}
                      className="text-foreground font-semibold hover:underline"
                    >
                      {batch.label}
                    </Link>
                    {issues ? (
                      <span title={roleIssueText(issues)} className="text-warning inline-flex">
                        <ExclamationTriangleIcon aria-label={roleIssueText(issues)} />
                      </span>
                    ) : null}
                  </span>
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
            );
          })}
          {batches.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={6} className="text-muted">
                {t("empty")}
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </>
  );
}
