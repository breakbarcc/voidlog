import { prisma } from "@voidlog/db";
import { Card } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { phaseColor } from "@/components/phase-badge";
import { translateMechanicName } from "@/lib/mechanic-names";
import { isNoiseMechanic } from "@/lib/mechanics";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";

// Matches messages/*.json's `logDetail.completed`/`reached`/`notReached` keys
// 1:1 — callers pass this straight to `t()`.
type PhaseStatus = "completed" | "reached" | "notReached";

function getPhaseStatus(phase: Readonly<{ reached: boolean; success: boolean }>): PhaseStatus {
  if (!phase.reached) return "notReached";
  return phase.success ? "completed" : "reached";
}

const PHASE_STATUS_CLASS: Record<PhaseStatus, string> = {
  completed: "bg-warning/15 text-warning",
  reached: "bg-line-soft text-muted-strong",
  notReached: "bg-line-soft/60 text-muted",
};

export default async function LogAnalysisPage(
  props: Readonly<PageProps<"/projects/[projectId]/batches/[batchId]/logs/[logFileId]">>,
) {
  const { projectId, batchId, logFileId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("logDetail");
  const tCommon = await getTranslations("common");
  const tSidebar = await getTranslations("sidebar");

  const logFile = await prisma.logFile.findUnique({
    where: { id: logFileId },
    include: {
      batch: true,
      encounterResult: {
        include: {
          playerResults: true,
          phaseResults: {
            orderBy: { order: "asc" },
            include: {
              mechanicEvents: { include: { playerResult: true }, orderBy: { timeMs: "asc" } },
            },
          },
        },
      },
    },
  });

  if (
    !logFile ||
    logFile.batchId !== batchId ||
    logFile.batch.projectId !== projectId ||
    !logFile.encounterResult
  ) {
    notFound();
  }

  const encounter = logFile.encounterResult;

  // The DB persists PhaseResult.playersAliveAtStart as a count only; we
  // recompute *who* was alive here from the persisted Dead MechanicEvents
  // (ADR-009) so the UI can show names, not just a number.
  const earliestDeathByPlayer = new Map<string, number>();
  for (const phase of encounter.phaseResults) {
    for (const event of phase.mechanicEvents) {
      if (event.mechanicName === "Dead" && event.playerResultId) {
        const existing = earliestDeathByPlayer.get(event.playerResultId);
        if (existing === undefined || event.timeMs < existing) {
          earliestDeathByPlayer.set(event.playerResultId, event.timeMs);
        }
      }
    }
  }

  return (
    <div className="max-w-3xl px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: logFile.batch.label, href: `/projects/${projectId}/batches/${batchId}` },
          { label: encounter.bossName },
        ]}
      />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-heading text-foreground-strong flex items-center gap-2 text-2xl font-bold">
            {encounter.bossName}
            {/* Normal Mode and Challenge Mode share the same bossId — this is
                the only visual signal an attempt was uploaded in the wrong mode. */}
            <span
              className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${
                encounter.isCM ? "bg-primary/15 text-primary" : "bg-line-soft text-muted-strong"
              }`}
            >
              {encounter.isCM ? "CM" : "NM"}
            </span>
          </h1>
          <p className="text-muted mt-1 text-sm">
            {t("summary", {
              result: encounter.success ? tCommon("kill") : tCommon("wipe"),
              batchLabel: logFile.batch.label,
              duration: Math.round(encounter.durationMs / 1000),
              playerCount: encounter.playerResults.length,
            })}
          </p>
        </div>
        {logFile.externalReportUrl ? (
          <a
            href={logFile.externalReportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent text-sm hover:underline"
          >
            {t("openExternalReport")}
          </a>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {encounter.playerResults.map((p) => (
          <span key={p.id} className="border-line bg-surface rounded-sm border px-2.5 py-1 text-sm">
            {p.characterName}{" "}
            <span className="text-muted">
              ({p.profession}, {p.dps} dps)
            </span>
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {encounter.phaseResults.map((phase) => {
          const aliveAtStart = encounter.playerResults.filter((p) => {
            const deathTime = earliestDeathByPlayer.get(p.id);
            return deathTime === undefined || deathTime > phase.startMs;
          });
          const color = phaseColor(encounter.bossId, phase.order, phase.name);
          const status = getPhaseStatus(phase);
          return (
            <Card
              key={phase.id}
              size="3"
              className="border-line bg-surface border"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="font-heading text-foreground text-[15.5px] font-semibold">
                    {phase.name}
                  </span>
                  <span
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${PHASE_STATUS_CLASS[status]}`}
                  >
                    {t(status)}
                  </span>
                </div>
                <span className="text-muted text-xs">
                  {phase.reached
                    ? t("aliveAtPhaseStart", {
                        alive: aliveAtStart.length,
                        total: encounter.playerResults.length,
                      })
                    : tCommon("dash")}
                </span>
              </div>

              {phase.mechanicEvents.some(
                (e) => !isNoiseMechanic(encounter.bossId, e.mechanicName),
              ) ? (
                <div className="border-line-soft mt-3 flex flex-wrap gap-2 border-t pt-3">
                  {phase.mechanicEvents
                    .filter((event) => !isNoiseMechanic(encounter.bossId, event.mechanicName))
                    .map((event) => (
                      <span
                        key={event.id}
                        className="border-line bg-surface-2 flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs"
                      >
                        <span className="bg-primary h-2 w-2 rounded-[1px]" />
                        <span className="text-muted-strong">
                          {translateMechanicName(
                            encounter.bossId,
                            locale,
                            event.mechanicName,
                            event.displayName,
                          )}
                        </span>
                        {event.playerResult ? (
                          <span className="text-danger font-semibold">
                            · {event.playerResult.characterName}
                          </span>
                        ) : null}
                      </span>
                    ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
