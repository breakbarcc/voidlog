import { prisma } from "@voidlog/db";
import type { ProgressNight } from "@/app/(app)/projects/[projectId]/phase-progress-trend";
import type { Locale } from "@/i18n/locale";
import { batchTitle } from "@/lib/batch-title";
import type { DpsNight } from "@/lib/dps-model";
import { damagePhases, impliedReachedPhases, isMainPhase, progressPhases } from "@/lib/main-phases";
import { chompMechanicNames, countChomps, hasChompCasts } from "@/lib/chomp-stats";
import { addCircleStats, type CircleStat } from "@/lib/green-details";
import { greenPercent, greenMechanicNames, squadGreens } from "@/lib/green-stats";
import { loadPhaseDamageByBatch } from "@/lib/phase-damage";
import { shockwaveMechanicNames, shockwavePercent, squadShockwaves } from "@/lib/shockwave-stats";

const OVERVIEW_MECHANIC_NAMES = [
  ...greenMechanicNames(),
  ...shockwaveMechanicNames(),
  ...chompMechanicNames(),
];

/**
 * Everything the project's history and statistics pages draw from, derived
 * from one query over the project's batches. `withDamage` additionally loads
 * the per-phase damage nights (an extra query — only the statistics page
 * needs them).
 */
export async function loadProjectOverview(projectId: string, locale: Locale, withDamage: boolean) {
  const rawBatches = await prisma.uploadBatch.findMany({
    where: { projectId },
    select: {
      id: true,
      label: true,
      createdAt: true,
      logFiles: {
        select: {
          encounterResult: {
            select: {
              bossId: true,
              success: true,
              recordedAt: true,
              phaseResults: {
                select: {
                  name: true,
                  order: true,
                  reached: true,
                  // Only what the overview computes from: the green stat and the
                  // shockwave statistics. A project holds hundreds of thousands
                  // of events, most of them irrelevant here.
                  mechanicEvents: {
                    where: { mechanicName: { in: OVERVIEW_MECHANIC_NAMES } },
                    select: {
                      mechanicName: true,
                      timeMs: true,
                      playerResultId: true,
                      // Green.Spawn wave details (which circle failed) — null on the rest.
                      context: true,
                    },
                  },
                },
              },
              playerResults: { select: { id: true, dps: true } },
            },
          },
        },
      },
    },
  });

  // Per Green circle (phase + position), over the whole project: how often it
  // was played and how often it was the one that failed. Only logs parsed
  // with the circle details contribute (see `pnpm backfill:greens`).
  const circlesByBoss = new Map<string, Map<string, CircleStat>>();
  for (const batch of rawBatches) {
    for (const file of batch.logFiles) {
      const encounter = file.encounterResult;
      if (!encounter) continue;
      const circles = circlesByBoss.get(encounter.bossId) ?? new Map<string, CircleStat>();
      addCircleStats(
        circles,
        encounter.phaseResults.flatMap((phase) =>
          phase.mechanicEvents.filter((e) => e.context !== null).map((e) => e.context),
        ),
      );
      circlesByBoss.set(encounter.bossId, circles);
    }
  }

  const batches = rawBatches
    .map((batch) => {
      const encounters = batch.logFiles
        .map((f) => f.encounterResult)
        .filter((e): e is NonNullable<typeof e> => e !== null);

      const kills = encounters.filter((e) => e.success).length;

      // Share of the squad's Greens casts that failed (at least one player),
      // over all attempts — see lib/green-stats.ts.
      let greensCast = 0;
      let greensFailed = 0;
      for (const encounter of encounters) {
        const greens = squadGreens(
          encounter.bossId,
          encounter.phaseResults.flatMap((phase) => phase.mechanicEvents),
        );
        greensCast += greens.played;
        greensFailed += greens.failed;
      }
      const greenFailedCount = greensFailed;
      const greenFailRate = greenPercent({ played: greensCast, failed: greensFailed });

      // "ShckWv.H" is Mordremoth's raw EI code for a Schockwelle hit — same
      // hardcoded-stat treatment as the Green-fail count above.
      // Share of the squad's shockwaves that failed (hit at least one player),
      // over all attempts — see lib/shockwave-stats.ts.
      let shockwavesPlayed = 0;
      let shockwavesHit = 0;
      for (const encounter of encounters) {
        const squad = squadShockwaves(
          encounter.bossId,
          encounter.phaseResults.flatMap((phase) =>
            phase.mechanicEvents.map((event) => ({
              mechanicName: event.mechanicName,
              timeMs: event.timeMs,
              playerKey: event.playerResultId,
            })),
          ),
          encounter.playerResults.map((player) => player.id),
        );
        shockwavesPlayed += squad.played;
        shockwavesHit += squad.hit;
      }
      const shockwaveHitRate = shockwavePercent({ played: shockwavesPlayed, hit: shockwavesHit });
      // Primordus Chomps: kills of the whole squad over the attempts that got
      // as far as the boss casting the attacks.
      let chompAttempts = 0;
      let chompSlam = 0;
      let chompJaws = 0;
      let chompAttemptsSlam = 0;
      let chompAttemptsAny = 0;
      for (const encounter of encounters) {
        const events = encounter.phaseResults.flatMap((phase) => phase.mechanicEvents);
        if (!hasChompCasts(encounter.bossId, events)) continue;
        const chomps = countChomps(encounter.bossId, events);
        chompAttempts += 1;
        chompSlam += chomps.slam;
        chompJaws += chomps.jaws;
        if (chomps.slam > 0) chompAttemptsSlam += 1;
        if (chomps.slam + chomps.jaws > 0) chompAttemptsAny += 1;
      }
      let furthestPhase: { name: string; order: number; bossId: string } | null = null;
      for (const encounter of encounters) {
        for (const phase of encounter.phaseResults) {
          if (
            phase.reached &&
            isMainPhase(encounter.bossId, phase.name) &&
            (!furthestPhase || phase.order > furthestPhase.order)
          ) {
            furthestPhase = { ...phase, bossId: encounter.bossId };
          }
        }
      }

      // Prefer the earliest in-game recording time across the batch's logs
      // (EI's timeStartStd) over upload time, so the trend/list reflect
      // when the raid actually happened, not upload order. Falls back to
      // `createdAt` for logs parsed before that field existed.
      const recordedTimestamps = encounters
        .map((e) => e.recordedAt)
        .filter((d): d is Date => d !== null);
      const occurredAt =
        recordedTimestamps.length > 0
          ? new Date(Math.min(...recordedTimestamps.map((d) => d.getTime())))
          : batch.createdAt;

      // Attempts per boss that reached each phase, for the phase progress chart.
      const reachByBoss = new Map<string, { attempts: number; reached: Map<string, number> }>();
      for (const e of encounters) {
        const entry = reachByBoss.get(e.bossId) ?? { attempts: 0, reached: new Map() };
        entry.attempts += 1;
        const names = impliedReachedPhases(
          e.bossId,
          e.phaseResults.filter((p) => p.reached).map((p) => p.name),
        );
        for (const name of names) {
          entry.reached.set(name, (entry.reached.get(name) ?? 0) + 1);
        }
        reachByBoss.set(e.bossId, entry);
      }

      return {
        id: batch.id,
        reachByBoss,
        label: batchTitle(batch.label, occurredAt, locale),
        createdAt: batch.createdAt,
        occurredAt,
        attempts: encounters.length,
        kills,
        greenFailedCount,
        greenFailRate,
        greensCast,
        greensFailed,
        shockwaveHitRate,
        shockwavesPlayed,
        shockwavesHit,
        chompAttempts,
        chompSlam,
        chompJaws,
        chompAttemptsSlam,
        chompAttemptsAny,
        furthestPhase,
      };
    })
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  // Oldest first: every batch with attempts, for the trend charts.
  const allTrendPoints = [...batches].reverse().filter((b) => b.attempts > 0);

  // The chart is about one encounter: the boss most attempts were made on.
  // Bosses without a curated phase list have nothing to lay out on the x axis.
  const attemptsByBoss = new Map<string, number>();
  for (const batch of batches) {
    for (const [bossId, { attempts }] of batch.reachByBoss) {
      attemptsByBoss.set(bossId, (attemptsByBoss.get(bossId) ?? 0) + attempts);
    }
  }
  const progressBossId = [...attemptsByBoss].sort((a, b) => b[1] - a[1])[0]?.[0];
  const progressPhaseNames = progressBossId ? progressPhases(progressBossId) : undefined;
  const progressNights: ProgressNight[] = progressBossId
    ? batches
        .filter((b) => b.reachByBoss.has(progressBossId))
        .reverse()
        .map((b) => {
          const entry = b.reachByBoss.get(progressBossId);
          return {
            id: b.id,
            occurredAt: b.occurredAt,
            attempts: entry?.attempts ?? 0,
            reached: Object.fromEntries(entry?.reached ?? []),
          };
        })
    : [];

  const dpsPhaseNames = progressBossId ? damagePhases(progressBossId) : undefined;
  const damageByBatch =
    withDamage && progressBossId && dpsPhaseNames
      ? await loadPhaseDamageByBatch(projectId, progressBossId, dpsPhaseNames)
      : new Map();
  const dpsNights: DpsNight[] = progressNights.map((night) => ({
    id: night.id,
    occurredAt: night.occurredAt,
    phases: damageByBatch.get(night.id) ?? {},
  }));

  const greenCircles = progressBossId
    ? [...(circlesByBoss.get(progressBossId)?.values() ?? [])]
    : [];

  return {
    batches,
    greenCircles,
    allTrendPoints,
    progressBossId,
    progressPhaseNames,
    progressNights,
    dpsPhaseNames,
    dpsNights,
  };
}
