import { MechanicCategory, prisma } from "@voidlog/db";
import type { BossConfig, MechanicCategory as SharedMechanicCategory } from "@voidlog/shared";
import {
  CAST_TARGET_GROUPS_BY_BOSS,
  CLUSTER_SPAWN_MARKERS_BY_BOSS,
  CURATED_CAST_MARKERS_BY_BOSS,
  EXCLUDED_ROTATION_SKILL_IDS,
} from "../boss-configs/cast-markers";
import { STEALTH_PHASES_BY_BOSS } from "../boss-configs/stealth-phases";
import { DEATH_MECHANIC_NAME, parseEiTimestamp } from "./ei-json-shape";
import type { EiRotationEntry } from "./ei-json-shape";
import type { ExtractedEncounter } from "./extract-encounter";

// An instant-cast skill firing right at the reveal instant can still be
// logged a tick or two *after* the reveal timestamp (confirmed on a real
// log: a 1ms gap) — combat-log granularity, not a causality violation. Kept
// far smaller than `toleranceMs` (which covers the backward case of a
// channeled/animated skill whose damage lands partway through its cast) so
// this doesn't start attributing genuinely later, unrelated casts.
const CAUSING_SKILL_FORWARD_TOLERANCE_MS = 200;

/**
 * Finds the skill cast most likely responsible for a "Revealed" debuff at
 * `revealTime`: the cast whose window `[castTime, castTime + duration]`
 * contains `revealTime` (an in-progress channeled/animated skill breaking
 * stealth partway through), the closest preceding cast within `toleranceMs`
 * (an instant-cast skill that finished before the reveal was logged), or a
 * cast starting up to `CAUSING_SKILL_FORWARD_TOLERANCE_MS` after
 * `revealTime` (an instant-cast skill logged a tick late) — all three
 * patterns confirmed on a real log, see stealth-phases.ts. Returns undefined
 * if nothing plausible is within tolerance, rather than guessing — notably
 * including the known gap where the real cause was a pet/phantasm/minion hit
 * with no timestamp anywhere in `rotation` (see stealth-phases.ts's "Known
 * gap" note).
 */
function findCausingSkill(
  rotation: EiRotationEntry[] | undefined,
  revealTime: number,
  toleranceMs: number,
  skillMap: Record<string, { name: string }>,
): { skillId: number; skillName: string } | undefined {
  let best: { skillId: number; skillName: string; distance: number } | undefined;
  for (const entry of rotation ?? []) {
    for (const cast of entry.skills) {
      const start = cast.castTime;
      const end = cast.castTime + (cast.duration ?? 0);
      let distance: number;
      if (revealTime >= start && revealTime <= end) {
        distance = 0;
      } else if (start > revealTime) {
        if (start - revealTime > CAUSING_SKILL_FORWARD_TOLERANCE_MS) continue;
        distance = start - revealTime;
      } else {
        distance = revealTime - end;
        if (distance > toleranceMs) continue;
      }
      if (!best || distance < best.distance) {
        best = {
          skillId: entry.id,
          skillName: skillMap[`s${entry.id}`]?.name ?? `Skill ${entry.id}`,
          distance,
        };
      }
    }
  }
  return best ? { skillId: best.skillId, skillName: best.skillName } : undefined;
}

/**
 * The phase (from EI's raw, unfiltered `phases[]` — not just curated main
 * boss phases) whose `end` is the largest value at or before `timeMs`, i.e.
 * "whatever most recently finished" — a boss-agnostic stand-in for "the
 * previous phase's target died", which is how the reference tool this data
 * is meant to be comparable against anchors its own timeline (see
 * stealth-phases.ts). Real HTCM phases don't overlap at their end/next-start
 * boundary, so in practice this resolves to the dragon phase that just
 * ended, not an intermission/sub-phase.
 */
function findMostRecentlyEndedPhase(
  phases: { name: string; start: number; end: number }[],
  timeMs: number,
): { name: string; end: number } | undefined {
  let best: { name: string; end: number } | undefined;
  for (const phase of phases) {
    if (phase.end <= timeMs && (!best || phase.end > best.end)) {
      best = { name: phase.name, end: phase.end };
    }
  }
  return best;
}

/**
 * Chains `items` (must be pre-sorted by `time`) into runs where each
 * consecutive pair is at most `gapMs` apart — e.g. `[0, 100, 900, 950]` with
 * `gapMs=250` produces `[[0,100],[900,950]]`, not one run of 4 (the 800ms
 * jump from 100 to 900 breaks the chain even though the whole span is under
 * some fixed window). Used to tell an intentional squad-wide "attack now"
 * burst of reveals (many players, all within the same instant) apart from
 * several unrelated isolated reveals that merely land in the same multi-
 * second window — see stealth-phases.ts's `groupRevealClusterGapMs`.
 */
function chainCluster<T extends { time: number }>(items: T[], gapMs: number): T[][] {
  const clusters: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    const last = current.at(-1);
    if (last && item.time - last.time > gapMs) {
      clusters.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** `context.phaseEnd` shape shared by STEALTH and REVEAL stealth-phase events. */
function phaseEndContext(
  precedingPhase: { name: string; end: number } | undefined,
  timeMs: number,
): { phaseName: string; phaseEndMs: number; msSincePhaseEnd: number } | undefined {
  if (!precedingPhase) return undefined;
  return {
    phaseName: precedingPhase.name,
    phaseEndMs: Math.round(precedingPhase.end),
    msSincePhaseEnd: Math.round(timeMs - precedingPhase.end),
  };
}

const CATEGORY_MAP: Record<SharedMechanicCategory, MechanicCategory> = {
  mistake: MechanicCategory.MISTAKE,
  stealth: MechanicCategory.STEALTH,
  reveal: MechanicCategory.REVEAL,
  green: MechanicCategory.GREEN,
  boss_specific: MechanicCategory.BOSS_SPECIFIC,
};

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "unknown"
  );
}

/**
 * Maps the streamed-out EI JSON subset (extract-encounter.ts) onto the
 * DB schema (ADR-005/009) and writes it in a single transaction.
 *
 * Simplifications for the step-2 minimal extraction, deliberately not
 * hardened further ("ein einzelner Test-Boss reicht"):
 * - PhaseResult.success: true for every phase except the last, which
 *   takes the overall encounter result. The raw EI phases array doesn't
 *   carry a per-phase success flag.
 * - PlayerResult.dps/deaths/downs read index 0 of dpsAll/defenses
 *   (assumed to be "all phases combined").
 */
export async function persistExtractedEncounter(
  logFileId: string,
  extracted: ExtractedEncounter,
  bossConfig: BossConfig | undefined,
): Promise<string> {
  const { root, players, targets } = extracted;

  const durationMs = root.durationMS ?? root.duration;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    throw new Error('EI JSON is missing a numeric "durationMS"/"duration" field');
  }

  const bossId =
    root.triggerID !== undefined ? String(root.triggerID) : slugify(root.fightName ?? "unknown");
  const bossName = root.fightName ?? "Unknown Encounter";

  const sortedPhases = [...root.phases].sort((a, b) => a.start - b.start);

  const deathMechanic = (root.mechanics ?? []).find((m) => m.name === DEATH_MECHANIC_NAME);
  const earliestDeathByActor = new Map<string, number>();
  for (const dataPoint of deathMechanic?.mechanicsData ?? []) {
    const existing = earliestDeathByActor.get(dataPoint.actor);
    if (existing === undefined || dataPoint.time < existing) {
      earliestDeathByActor.set(dataPoint.actor, dataPoint.time);
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const encounter = await tx.encounterResult.create({
        data: {
          logFileId,
          bossId,
          bossName,
          isCM: root.isCM ?? false,
          success: root.success,
          durationMs: Math.round(durationMs),
          recordedAt: parseEiTimestamp(root.timeStartStd) ?? null,
        },
      });

      const playerIdByCharacterName = new Map<string, string>();
      for (const player of players) {
        const dps = player.dpsAll?.[0]?.dps ?? 0;
        const deaths = player.defenses?.[0]?.deadCount ?? 0;
        const downs = player.defenses?.[0]?.downCount ?? 0;
        const created = await tx.playerResult.create({
          data: {
            encounterResultId: encounter.id,
            account: player.account,
            characterName: player.name,
            profession: player.profession,
            group: player.group ?? null,
            dps: Math.round(dps),
            deaths: Math.round(deaths),
            downs: Math.round(downs),
          },
        });
        playerIdByCharacterName.set(player.name, created.id);
      }

      const totalPlayers = players.length;
      const phaseIdsInOrder: string[] = [];
      for (let i = 0; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i]!;
        const isLast = i === sortedPhases.length - 1;
        const playersAliveAtStart =
          totalPlayers -
          [...earliestDeathByActor.values()].filter((deathTime) => deathTime <= phase.start).length;

        const createdPhase = await tx.phaseResult.create({
          data: {
            encounterResultId: encounter.id,
            name: phase.name,
            order: i,
            startMs: Math.round(phase.start),
            endMs: Math.round(phase.end),
            reached: true,
            success: isLast ? root.success : true,
            playersAliveAtStart,
          },
        });
        phaseIdsInOrder.push(createdPhase.id);
      }

      // A timestamp usually falls inside several overlapping phases at once
      // — e.g. "Full Fight" spans the entire encounter — so picking the
      // *first* containing phase (in start-ascending order) always matched
      // that catch-all instead of the actual dragon/sub-phase. Pick the
      // *narrowest* containing phase instead.
      function resolvePhaseIndex(timeMs: number): number {
        let bestIndex = -1;
        let bestSpan = Infinity;
        for (let i = 0; i < sortedPhases.length; i++) {
          const phase = sortedPhases[i]!;
          if (timeMs < phase.start || timeMs >= phase.end) continue;
          const span = phase.end - phase.start;
          if (span < bestSpan) {
            bestSpan = span;
            bestIndex = i;
          }
        }
        if (bestIndex !== -1) return bestIndex;
        return timeMs < sortedPhases[0]!.start ? 0 : sortedPhases.length - 1;
      }

      for (const mechanic of root.mechanics ?? []) {
        const mapping = bossConfig?.mechanics.find((m) => m.rawName === mechanic.name);
        const category = CATEGORY_MAP[mapping?.category ?? "boss_specific"];
        const displayName = mapping?.displayName ?? mechanic.name;

        for (const dataPoint of mechanic.mechanicsData) {
          const phaseIndex = resolvePhaseIndex(dataPoint.time);
          await tx.mechanicEvent.create({
            data: {
              phaseResultId: phaseIdsInOrder[phaseIndex]!,
              playerResultId: playerIdByCharacterName.get(dataPoint.actor) ?? null,
              mechanicName: mechanic.name,
              category,
              displayName,
              timeMs: Math.round(dataPoint.time),
            },
          });
        }
      }

      // Boss-ability casts (see cast-markers.ts): unlike root.mechanics,
      // these come from the target's own cast log, so they exist even when
      // every player avoided the attack — no playerResultId, since a cast
      // isn't attributable to any one player.
      const curatedMarkers = CURATED_CAST_MARKERS_BY_BOSS[bossId] ?? [];
      const curatedKeys = new Set(curatedMarkers.map((m) => `${m.targetId}::${m.skillId}`));

      for (const marker of curatedMarkers) {
        const target = targets.find((t) => t.id === marker.targetId);
        const rotationEntry = target?.rotation?.find((r) => r.id === marker.skillId);
        for (const cast of rotationEntry?.skills ?? []) {
          const phaseIndex = resolvePhaseIndex(cast.castTime);
          await tx.mechanicEvent.create({
            data: {
              phaseResultId: phaseIdsInOrder[phaseIndex]!,
              playerResultId: null,
              mechanicName: marker.mechanicName,
              category: MechanicCategory.BOSS_SPECIFIC,
              displayName: marker.displayName,
              timeMs: Math.round(cast.castTime),
            },
          });
        }
      }

      // Every other cast for these targets, captured generically (not
      // individually named/curated yet) so the data already exists for
      // later analysis. Giants: all instances in a group share one
      // mechanicName — which specific giant cast it isn't tracked.
      for (const group of CAST_TARGET_GROUPS_BY_BOSS[bossId] ?? []) {
        for (const targetId of group.targetIds) {
          for (const target of targets.filter((t) => t.id === targetId)) {
            for (const rot of target.rotation ?? []) {
              if (EXCLUDED_ROTATION_SKILL_IDS.has(rot.id)) continue;
              if (curatedKeys.has(`${targetId}::${rot.id}`)) continue;

              const skillName = root.skillMap[`s${rot.id}`]?.name ?? `Skill ${rot.id}`;
              const mechanicName = `${group.groupKey}.Cast.${rot.id}`;
              for (const cast of rot.skills) {
                const phaseIndex = resolvePhaseIndex(cast.castTime);
                await tx.mechanicEvent.create({
                  data: {
                    phaseResultId: phaseIdsInOrder[phaseIndex]!,
                    playerResultId: null,
                    mechanicName,
                    category: MechanicCategory.BOSS_SPECIFIC,
                    displayName: skillName,
                    timeMs: Math.round(cast.castTime),
                  },
                });
              }
            }
          }
        }
      }

      // Hazard occurrences with no cast log of their own (see cast-markers.ts
      // for why this clusters raw mechanic timestamps instead of using
      // EiTarget.firstAware — the latter only reflects the *first*
      // occurrence, silently dropping every repeat).
      for (const marker of CLUSTER_SPAWN_MARKERS_BY_BOSS[bossId] ?? []) {
        const times = (root.mechanics ?? [])
          .filter((m) => marker.sourceMechanicNames.includes(m.name))
          .flatMap((m) => m.mechanicsData.map((d) => d.time))
          .sort((a, b) => a - b);

        let lastTime: number | undefined;
        for (const time of times) {
          const isNewCluster = lastTime === undefined || time - lastTime > marker.clusterGapMs;
          lastTime = time;
          if (!isNewCluster) continue;

          const phaseIndex = resolvePhaseIndex(time);
          await tx.mechanicEvent.create({
            data: {
              phaseResultId: phaseIdsInOrder[phaseIndex]!,
              playerResultId: null,
              mechanicName: marker.mechanicName,
              category: MechanicCategory.BOSS_SPECIFIC,
              displayName: marker.displayName,
              timeMs: Math.round(time),
            },
          });
        }
      }

      // "Invisible phase" mechanic (see stealth-phases.ts): one STEALTH
      // event per Mass-Invisibility-style cast (attributed to the caster,
      // found by scanning every player's own rotation for the watched skill
      // id — only one player casts it, but which one varies), then one
      // REVEAL event for each player whose "Revealed" buff transitions to
      // active while the invisibility is still up — EXCEPT when a burst of
      // several players reveal together (an intentional squad-wide "attack
      // now" call, not mistakes — see `groupRevealMinSize`/
      // `groupRevealClusterGapMs`), which is dropped entirely rather than
      // persisted. `rotation`/`buffUptimesActive` are read here only — never
      // written to the DB as-is (see ei-json-shape.ts).
      for (const config of STEALTH_PHASES_BY_BOSS[bossId] ?? []) {
        const invisCasts: { timeMs: number; durationMs: number; casterName: string }[] = [];
        for (const player of players) {
          const entry = player.rotation?.find((r) => r.id === config.invisSkillId);
          for (const cast of entry?.skills ?? []) {
            invisCasts.push({
              timeMs: cast.castTime,
              durationMs: cast.duration ?? 0,
              casterName: player.name,
            });
          }
        }
        invisCasts.sort((a, b) => a.timeMs - b.timeMs);

        for (const invisCast of invisCasts) {
          // Anchors both this event and its reveals to the same "previous
          // phase ended" reference the comparison tool uses, so a value like
          // "msSincePhaseEnd" lines up 1:1 with what that tool shows —
          // confirmed against two real logs (both invis casts landed <1s
          // after their dragon phase's `end`, matching that tool's reading).
          const precedingPhase = findMostRecentlyEndedPhase(sortedPhases, invisCast.timeMs);
          const invisPhaseEnd = phaseEndContext(precedingPhase, invisCast.timeMs);

          const phaseIndex = resolvePhaseIndex(invisCast.timeMs);
          await tx.mechanicEvent.create({
            data: {
              phaseResultId: phaseIdsInOrder[phaseIndex]!,
              playerResultId: playerIdByCharacterName.get(invisCast.casterName) ?? null,
              mechanicName: config.mechanicName,
              category: MechanicCategory.STEALTH,
              displayName: config.displayName,
              timeMs: Math.round(invisCast.timeMs),
              context: invisPhaseEnd ? { phaseEnd: invisPhaseEnd } : undefined,
            },
          });

          // Bounded by the buff's own duration from when the channel
          // actually finishes (cast start + its own duration), not from
          // cast start — see stealthDurationMs doc.
          const stealthExpiresAt =
            invisCast.timeMs + invisCast.durationMs + config.stealthDurationMs;
          const revealsInWindow: { time: number; playerName: string }[] = [];
          for (const player of players) {
            const buffEntry = player.buffUptimesActive?.find((b) => b.id === config.revealBuffId);
            const revealTime = (buffEntry?.states ?? []).find(
              ([time, presence]) =>
                presence === 1 && time >= invisCast.timeMs && time <= stealthExpiresAt,
            )?.[0];
            if (revealTime === undefined) continue;
            revealsInWindow.push({ time: revealTime, playerName: player.name });
          }
          revealsInWindow.sort((a, b) => a.time - b.time);

          const isolatedReveals = chainCluster(
            revealsInWindow,
            config.groupRevealClusterGapMs,
          ).filter((cluster) => cluster.length < config.groupRevealMinSize);

          for (const { time: revealTime, playerName } of isolatedReveals.flat()) {
            const player = players.find((p) => p.name === playerName)!;
            const causingSkill = findCausingSkill(
              player.rotation,
              revealTime,
              config.causingSkillToleranceMs,
              root.skillMap,
            );
            // Reveal shares the invis cast's `precedingPhase` (not its own
            // narrowest-containing phase) — the whole invis window is one
            // "how long after the phase ended" story, so every reveal in it
            // should be measured against the same reference point.
            const revealPhaseEnd = phaseEndContext(precedingPhase, revealTime);
            // How long stealth actually held before this player broke it —
            // distinct from `phaseEnd.msSincePhaseEnd` above (which measures
            // against the dragon phase's end, not the cast itself). Measured
            // from the cast's *end* (channel finish), matching
            // `stealthExpiresAt` above — from cast *start* this could read
            // above the 6s `stealthDurationMs` cap by the channel's own
            // length (~1-1.5s observed), which reads as "outlasting the buff"
            // when the reveal is actually well within it.
            const msSinceInvisCast = Math.round(
              revealTime - (invisCast.timeMs + invisCast.durationMs),
            );

            const revealPhaseIndex = resolvePhaseIndex(revealTime);
            await tx.mechanicEvent.create({
              data: {
                phaseResultId: phaseIdsInOrder[revealPhaseIndex]!,
                playerResultId: playerIdByCharacterName.get(playerName) ?? null,
                mechanicName: config.revealMechanicName,
                category: MechanicCategory.REVEAL,
                displayName: config.revealDisplayName,
                timeMs: Math.round(revealTime),
                context: {
                  ...(causingSkill ? { causingSkill } : {}),
                  ...(revealPhaseEnd ? { phaseEnd: revealPhaseEnd } : {}),
                  msSinceInvisCast,
                },
              },
            });
          }
        }
      }

      return encounter.id;
    },
    { timeout: 30_000 },
  );
}
