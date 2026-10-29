import { Table } from "@radix-ui/themes";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { PhaseBadge } from "@/components/phase-badge";
import { loadProjectOverview } from "@/lib/project-overview";
import { PhaseProgressTrend } from "../phase-progress-trend";

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
  const { batches, progressBossId, progressPhaseNames, progressNights } = await loadProjectOverview(
    projectId,
    locale,
    false,
  );

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
    </>
  );
}
