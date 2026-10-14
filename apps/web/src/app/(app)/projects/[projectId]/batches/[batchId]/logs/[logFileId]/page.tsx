import { loadBatchTitles } from "@/lib/batch-title";
import { prisma } from "@voidlog/db";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { phaseColor } from "@/components/phase-badge";
import {
  impliedReachedPhases,
  isMainPhase,
  isTransitionPhase,
  progressPhases,
} from "@/lib/main-phases";
import { buildAttemptTimelineData } from "@/lib/attempt-timeline";
import {
  GREEN_MIN_PLAYERS,
  greenCircleName,
  readGreenDetail,
  type GreenDetail,
} from "@/lib/green-details";
import { translateMechanicName } from "@/lib/mechanic-names";
import {
  DOWNED_MECHANIC_NAME,
  GENERIC_CAST_MARKER_NAME_PART,
  isContextualNoiseMechanic,
  isNoiseMechanic,
  isVisibleCastMarker,
} from "@/lib/mechanics";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import {
  LogTimeline,
  type EventCategory,
  type LogEvent,
  type LogPhase,
  type LogTimelineData,
} from "./log-timeline";

const DEAD = "Dead";
const RESPAWN = "Resp";
// Synthetic Greens marker (one per wave, see worker cast-markers.ts). It only
// reads as a success when no player failed a Green around the same time.
const GREEN_RESOLVED = "Green.Spawn";
const GREEN_FAILED = "F.Green";
const GREEN_FAIL_WINDOW_MS = 3000;

// storageKeyRaw looks like "raw/<batchId>/<uuid>-<sanitized filename>" — strip
// the batch/uuid prefix so the original log file name shows.
function displayFileName(storageKeyRaw: string): string {
  const last = storageKeyRaw.split("/").pop() ?? storageKeyRaw;
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
}

interface RawEvent {
  id: string;
  mechanicName: string;
  displayName: string;
  timeMs: number;
  playerResultId: string | null;
  context: unknown;
}

function categorize(bossId: string, event: RawEvent, all: RawEvent[]): EventCategory | null {
  if (event.mechanicName === DEAD) return "death";
  if (event.mechanicName === RESPAWN) return null;
  if (event.mechanicName === DOWNED_MECHANIC_NAME) return "down";
  if (event.mechanicName === GREEN_RESOLVED) {
    const failed = all.some(
      (e) =>
        e.mechanicName === GREEN_FAILED &&
        Math.abs(e.timeMs - event.timeMs) <= GREEN_FAIL_WINDOW_MS,
    );
    return failed ? null : "ok";
  }
  // A failed wave flags all three circles as failed — only the one that was
  // short on players is the failure, the others were dragged along.
  if (readGreenDetail(bossId, event.context)?.result === "collateral") return null;
  if (isNoiseMechanic(bossId, event.mechanicName)) return null;
  if (isContextualNoiseMechanic(bossId, event, all)) return null;
  if (isVisibleCastMarker(bossId, event.mechanicName)) return "info";
  return "fail";
}

/** "Soo-Won 2 SE · BoonDPS · 1/2 im Kreis: Name" — which circle, whose job, who was in it. */
function greenFailDetail(
  green: GreenDetail,
  tInside: (count: number, min: number) => string,
): string {
  const parts = [greenCircleName(green)];
  if (green.role) parts.push(green.role);
  if (green.insideKnown) {
    const inside = tInside(green.inside.length, GREEN_MIN_PLAYERS);
    parts.push(green.inside.length > 0 ? `${inside}: ${green.inside.join(", ")}` : inside);
  }
  return parts.join(" · ");
}

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
              mechanicEvents: {
                where: { NOT: { mechanicName: { contains: GENERIC_CAST_MARKER_NAME_PART } } },
                include: { playerResult: true },
                orderBy: { timeMs: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const batchName = logFile
    ? ((await loadBatchTitles([logFile.batch], locale)).get(logFile.batchId) ?? logFile.batch.label)
    : "";

  if (
    !logFile ||
    logFile.batchId !== batchId ||
    logFile.batch.projectId !== projectId ||
    !logFile.encounterResult
  ) {
    notFound();
  }

  const encounter = logFile.encounterResult;
  const bossId = encounter.bossId;

  // Attempt number within the batch, in the order the fights actually happened.
  const siblings = await prisma.encounterResult.findMany({
    where: { logFile: { batchId } },
    select: { id: true, recordedAt: true, createdAt: true },
  });
  const attemptNo =
    siblings
      .sort(
        (a, b) => (a.recordedAt ?? a.createdAt).getTime() - (b.recordedAt ?? b.createdAt).getTime(),
      )
      .findIndex((e) => e.id === encounter.id) + 1;

  const rawEvents: RawEvent[] = encounter.phaseResults.flatMap((p) => p.mechanicEvents);

  const players = encounter.playerResults.map((p) => ({
    id: p.id,
    name: p.characterName,
    account: p.account,
    role: p.role,
  }));

  // Every event of the fight with its category — noise dropped.
  const events: LogEvent[] = [];
  for (const raw of rawEvents) {
    const category = categorize(bossId, raw, rawEvents);
    if (!category) continue;
    const label =
      category === "death"
        ? t("categories.death")
        : category === "down"
          ? t("categories.down")
          : translateMechanicName(bossId, locale, raw.mechanicName, raw.displayName);
    const green = category === "fail" ? readGreenDetail(bossId, raw.context) : null;
    events.push({
      id: raw.id,
      timeMs: raw.timeMs,
      type: raw.mechanicName,
      label,
      detail: green
        ? greenFailDetail(green, (count, min) => t("greenInside", { count, min }))
        : undefined,
      category,
      playerId: raw.playerResultId,
    });
  }
  events.sort((a, b) => a.timeMs - b.timeMs);

  // Events are attached to the narrowest sub-phase when persisted, so they are
  // re-bucketed by time against the main phases (an event between two phases
  // belongs to the one it followed).
  const reachedMain = encounter.phaseResults
    .filter((p) => p.reached && isMainPhase(bossId, p.name))
    .sort((a, b) => a.startMs - b.startMs);

  const deathTimes = new Map<string, number>();
  for (const e of events) {
    if (e.category === "death" && e.playerId && !deathTimes.has(e.playerId)) {
      deathTimes.set(e.playerId, e.timeMs);
    }
  }

  const phases: LogPhase[] = reachedMain.map((p, i) => {
    const next = reachedMain[i + 1];
    const upper = next?.startMs ?? Infinity;
    const lower = i === 0 ? -Infinity : p.startMs;
    const isLast = i === reachedMain.length - 1;
    const alive = players.filter((pl) => {
      const died = deathTimes.get(pl.id);
      return died === undefined || died > p.startMs;
    }).length;
    return {
      key: p.name,
      name: p.name,
      kind: isTransitionPhase(bossId, p.name) ? "transition" : "boss",
      startMs: p.startMs,
      endMs: Math.min(p.endMs, next?.startMs ?? p.endMs),
      color: phaseColor(bossId, p.order, p.name),
      aliveAtStart: alive,
      status: isLast && !encounter.success ? "wipe" : "completed",
      events: events.filter((e) => e.timeMs >= lower && e.timeMs < upper),
    };
  });

  // Phases the attempt never got to, in fight order.
  const implied = impliedReachedPhases(
    bossId,
    reachedMain.map((p) => p.name),
  );
  for (const name of progressPhases(bossId) ?? []) {
    if (implied.has(name) || phases.some((p) => p.name === name)) continue;
    phases.push({
      key: name,
      name,
      kind: isTransitionPhase(bossId, name) ? "transition" : "boss",
      startMs: 0,
      endMs: 0,
      color: phaseColor(bossId, phases.length, name),
      aliveAtStart: null,
      status: "notReached",
      events: [],
    });
  }

  const data: LogTimelineData = {
    timeline: buildAttemptTimelineData(encounter, locale),
    durationMs: encounter.durationMs,
    playerCount: encounter.playerResults.length,
    players,
    phases,
  };

  const count = (c: EventCategory) => events.filter((e) => e.category === c).length;
  const lastReached = reachedMain.at(-1);
  const seconds = Math.round(encounter.durationMs / 1000);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const stats: { label: string; value: string | number; className: string }[] = [
    { label: t("stats.duration"), value: duration, className: "text-foreground-strong" },
    { label: t("stats.fails"), value: count("fail"), className: "text-danger" },
    { label: t("stats.downs"), value: count("down"), className: "text-warning" },
    { label: t("stats.deaths"), value: count("death"), className: "text-danger" },
  ];

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: batchName, href: `/projects/${projectId}/batches/${batchId}` },
          { label: t("attempt", { n: attemptNo }) },
        ]}
      />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-heading text-foreground-strong flex items-center gap-3 text-3xl font-bold">
            {t("attempt", { n: attemptNo })}
            <span
              className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${
                encounter.success ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"
              }`}
            >
              {encounter.success ? tCommon("kill") : tCommon("wipe")}
            </span>
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
            {t("subtitle", {
              boss: lastReached?.name ?? encounter.bossName,
              duration,
              playerCount: encounter.playerResults.length,
            })}
          </p>
          <p className="text-muted mt-0.5 text-xs">
            {t("logName")}:{" "}
            <span className="text-muted-strong">{displayFileName(logFile.storageKeyRaw)}</span>
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="border-line bg-surface rounded-sm border px-4 py-3">
            <div className="text-muted text-[11px] font-medium uppercase tracking-wide">
              {s.label}
            </div>
            <div className={`font-heading mt-1 text-2xl font-bold ${s.className}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <LogTimeline data={data} />
    </div>
  );
}
