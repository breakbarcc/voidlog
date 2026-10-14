import type { GreensConfig } from "../boss-configs/greens";
import type {
  EiCombatReplay,
  EiMechanicDataPoint,
  EiPhase,
  EiPlayer,
  EiRoot,
  EiTarget,
} from "./ei-json-shape";

/**
 * Turns EI's raw `S.Green` / `F.Green` mechanic events into waves of Green
 * circles and works out, per circle, who stood in it — see
 * boss-configs/greens.ts for what is known about the mechanic.
 *
 * What the game decides is authoritative: an `S.Green` is never a failure,
 * and a wave with an `F.Green` always counts as failed. The positions only
 * explain *which* circle was short on players — they are sampled at a coarse
 * 300ms polling rate, so a player teleporting or running through the edge
 * can be missed.
 */

export type GreenResult =
  /** The circle held (`S.Green`). */
  | "ok"
  /** The circle that was short on players (`F.Green`, fewer than `minPlayers` inside). */
  | "failed"
  /**
   * Flagged `F.Green` too, but had enough players. A failed wave marks every
   * circle of the wave as failed in EI, not only the one that was short.
   */
  | "collateral";

export interface ResolvedGreen {
  /** The raw EI event, so the persister can attach this to its row. */
  dataPoint: EiMechanicDataPoint;
  /** `null` when the circle could not be identified (see `identifyEnvironmentGreens`). */
  targetId: number | null;
  label: string | null;
  result: GreenResult;
  /** Character names of the players standing in the circle just before it resolved. */
  inside: string[];
  /** False when the circle's position was unavailable, so `inside` is not meaningful. */
  insideKnown: boolean;
}

export interface ResolvedWave {
  timeMs: number;
  boss: string;
  /** Role-table key: the boss, with Soo-Won split into its two halves. */
  phase: string;
  /** 1-based, counted within `phase`. */
  wave: number;
  failed: boolean;
  greens: ResolvedGreen[];
}

interface RawGreenEvent {
  dataPoint: EiMechanicDataPoint;
  failMechanic: boolean;
}

const DEFAULT_POLLING_RATE_MS = 300;

function positionAt(
  replay: EiCombatReplay | undefined,
  timeMs: number,
  pollingRateMs: number,
): [number, number] | undefined {
  const positions = replay?.positions;
  if (!positions || positions.length === 0) return undefined;
  const index = Math.round((timeMs - (replay.start ?? 0)) / pollingRateMs);
  return positions[Math.min(Math.max(index, 0), positions.length - 1)];
}

function isDownOrDead(replay: EiCombatReplay | undefined, timeMs: number): boolean {
  const within = (intervals: [number, number][] | undefined) =>
    (intervals ?? []).some(([start, end]) => timeMs >= start && timeMs <= end);
  return within(replay?.down) || within(replay?.dead);
}

/**
 * Who stood in the circle: players within `insideRadius` of it at the last
 * position sample before the event or at the event itself (a runner can be
 * outside on one sample and inside on the other) while neither downed nor
 * dead.
 */
function playersInside(
  config: GreensConfig,
  circle: EiCombatReplay | undefined,
  players: EiPlayer[],
  timeMs: number,
  pollingRateMs: number,
): string[] | undefined {
  const sampleTimes = [timeMs - pollingRateMs, timeMs];
  if (!positionAt(circle, timeMs, pollingRateMs)) return undefined;

  return players
    .filter((player) =>
      sampleTimes.some((time) => {
        const circlePosition = positionAt(circle, time, pollingRateMs);
        const playerPosition = positionAt(player.combatReplayData, time, pollingRateMs);
        if (!circlePosition || !playerPosition) return false;
        if (isDownOrDead(player.combatReplayData, time)) return false;
        return (
          Math.hypot(
            playerPosition[0] - circlePosition[0],
            playerPosition[1] - circlePosition[1],
          ) <= config.insideRadius
        );
      }),
    )
    .map((player) => player.name);
}

/**
 * EI reports a resolution as the generic `Environment` actor (not the circle)
 * when the circle's own actor is already gone at that moment — seen on the
 * last wave of a phase. A wave always has the same set of circles, so when
 * exactly one circle of the boss is unaccounted for and exactly one event is
 * unnamed, that event is the missing circle. With more than one unnamed event
 * the order can't be told, so they stay unidentified.
 */
function identifyEnvironmentGreens(
  config: GreensConfig,
  boss: string,
  events: RawGreenEvent[],
): Map<RawGreenEvent, number> {
  const named = new Set<number>();
  const unnamed: RawGreenEvent[] = [];
  for (const event of events) {
    const id = event.dataPoint.id;
    if (id !== undefined && id in config.targets) named.add(id);
    else unnamed.push(event);
  }
  const missing = Object.entries(config.targets)
    .filter(([id, info]) => info.boss === boss && !named.has(Number(id)))
    .map(([id]) => Number(id));

  const resolved = new Map<RawGreenEvent, number>();
  if (unnamed.length === 1 && missing.length === 1) resolved.set(unnamed[0]!, missing[0]!);
  return resolved;
}

export function resolveGreenWaves(
  config: GreensConfig,
  root: Pick<EiRoot, "mechanics" | "combatReplayMetaData">,
  players: EiPlayer[],
  targets: EiTarget[],
  phases: EiPhase[],
): ResolvedWave[] {
  const pollingRateMs = root.combatReplayMetaData?.pollingRate ?? DEFAULT_POLLING_RATE_MS;
  const replayById = new Map<number, EiCombatReplay | undefined>(
    targets.map((target) => [target.id, target.combatReplayData]),
  );

  const events: RawGreenEvent[] = [];
  for (const mechanic of root.mechanics) {
    const isSuccess = mechanic.name === config.successMechanic;
    const isFail = mechanic.name === config.failMechanic;
    if (!isSuccess && !isFail) continue;
    for (const dataPoint of mechanic.mechanicsData) {
      events.push({ dataPoint, failMechanic: isFail });
    }
  }
  events.sort((a, b) => a.dataPoint.time - b.dataPoint.time);

  const waveEvents: RawGreenEvent[][] = [];
  for (const event of events) {
    const current = waveEvents.at(-1);
    const last = current?.at(-1);
    if (current && last && event.dataPoint.time - last.dataPoint.time <= config.waveGapMs) {
      current.push(event);
    } else {
      waveEvents.push([event]);
    }
  }

  const soo2Start = phases.find((phase) => phase.name === "Soo-Won 2")?.start;
  const waveCountByPhase = new Map<string, number>();
  const waves: ResolvedWave[] = [];

  for (const group of waveEvents) {
    const namedIds = group
      .map((event) => event.dataPoint.id)
      .filter((id): id is number => id !== undefined && id in config.targets);
    const boss = namedIds.length > 0 ? config.targets[namedIds[0]!]!.boss : undefined;
    // No circle of the wave could be identified at all — nothing to attribute.
    if (!boss) continue;

    const timeMs = group[0]!.dataPoint.time;
    const phase =
      boss === "Soo-Won"
        ? soo2Start !== undefined && timeMs >= soo2Start
          ? "Soo-Won 2"
          : "Soo-Won 1"
        : boss;
    const wave = (waveCountByPhase.get(phase) ?? 0) + 1;
    waveCountByPhase.set(phase, wave);

    const inferred = identifyEnvironmentGreens(config, boss, group);
    const greens: ResolvedGreen[] = group.map((event) => {
      const id = event.dataPoint.id;
      const named = id !== undefined && id in config.targets;
      const targetId = named ? id : (inferred.get(event) ?? null);
      // An inferred circle's own actor was already gone when it resolved, so
      // its last known position says nothing about who stood there.
      const inside =
        targetId === null || !named
          ? undefined
          : playersInside(
              config,
              replayById.get(targetId),
              players,
              event.dataPoint.time,
              pollingRateMs,
            );
      return {
        dataPoint: event.dataPoint,
        targetId,
        label: targetId === null ? null : config.targets[targetId]!.label,
        // Resolved below once the whole wave is known.
        result: event.failMechanic ? "failed" : "ok",
        inside: inside ?? [],
        insideKnown: inside !== undefined,
      };
    });

    // An `F.Green` with enough players inside was dragged along with the
    // circle that was actually short — unless no circle was short on the
    // positions at all (polling noise), where every flagged circle stays failed.
    const flagged = greens.filter((_, i) => group[i]!.failMechanic);
    const short = flagged.filter((g) => !g.insideKnown || g.inside.length < config.minPlayers);
    if (short.length > 0) {
      for (const green of flagged) {
        if (!short.includes(green)) green.result = "collateral";
      }
    }

    waves.push({ timeMs, boss, phase, wave, failed: flagged.length > 0, greens });
  }

  return waves;
}
