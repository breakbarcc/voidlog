/**
 * Minimal shape of an Elite Insights JSON report, restricted to the
 * fields the extractor (ADR-008) actually reads.
 *
 * `duration`/`success`/`isCM`, `phases[]`, and `mechanics[].mechanicsData[]`
 * field names come directly from the empirical analysis in ADR-008/ADR-005.
 * `triggerID`/`fightName` (boss id/name) and the exact internal shape of
 * `dpsAll`/`defenses` per player are NOT confirmed by the ADR text — they
 * are this codebase's best-effort assumption based on common EI JSON
 * versions, kept isolated here so they're easy to correct once verified
 * against one real dps.report response (see README "Step 2" notes).
 */

export interface EiPhase {
  name: string;
  start: number;
  end: number;
  /** Indices into the root `targets[]` this phase is about. */
  targets?: number[];
}

export interface EiMechanicDataPoint {
  time: number;
  actor: string;
}

export interface EiMechanic {
  name: string;
  description?: string;
  mechanicsData: EiMechanicDataPoint[];
}

export interface EiPlayerDpsAllEntry {
  dps?: number;
}

export interface EiPlayerDefensesEntry {
  deadCount?: number;
  downCount?: number;
}

/**
 * One buff id's presence timeline for a single player, e.g. id 890 =
 * "Revealed" (per buffMap). `states` is a flat list of `[timeMs, presence]`
 * transitions (presence 0|1) — kept only for buff ids the stealth-phase
 * config (see boss-configs/stealth-phases.ts) actually watches; the rest of
 * this array's fields (`buffData`, `statesPerSource` — per-source generation
 * stats, the bulk of this structure's ~100KB/player size) are never read.
 */
export interface EiPlayerBuffUptimeActiveEntry {
  id: number;
  states?: [number, number][];
}

export interface EiPlayer {
  account: string;
  name: string;
  profession: string;
  group?: number;
  /** Per-phase array; index 0 is assumed to be "all phases combined". */
  dpsAll?: EiPlayerDpsAllEntry[];
  /** Per-phase array; index 0 is assumed to be "all phases combined". */
  defenses?: EiPlayerDefensesEntry[];
  /**
   * This player's own skill-cast log — kept transiently to detect
   * stealth-phase casts (see boss-configs/stealth-phases.ts) and to
   * attribute a "Revealed" debuff to the skill that likely caused it. Never
   * persisted wholesale (~20-27KB/player, ~300+ casts) — only the handful
   * of derived STEALTH/REVEAL MechanicEvent rows survive extraction.
   */
  rotation?: EiRotationEntry[];
  /**
   * Kept transiently for the same reason as `rotation` — only entries whose
   * `id` the stealth-phase config watches are ever read; the field is never
   * persisted as-is.
   */
  buffUptimesActive?: EiPlayerBuffUptimeActiveEntry[];
  // statsAll, support, deathRecap, consumables, activeTimes are read by
  // dps.report/EI too but not needed for the step-2 minimal extraction.
}

/** One cast of `id` (a skill id, matching a `skillMap` key without the "s" prefix). */
export interface EiRotationEntry {
  id: number;
  skills: { castTime: number; duration?: number }[];
}

export interface EiTarget {
  name: string;
  /**
   * Stable per-species id (e.g. -22 for Primordus, 25025 for the Time
   * Caster) — negative for "legendary"/scripted encounter actors, positive
   * for regular NPC species ids. Unlike `name`, this does NOT change with
   * the recording client's game-client language (confirmed: a German-client
   * log names the giants "Riese der Leere 1/2/3", an English-client log
   * "Void Giant 1/2/3" — both share id 24450). Match targets on this, not
   * on `name`.
   */
  id: number;
  /** Absent for targets EI didn't track a cast log for (e.g. static hazards). */
  rotation?: EiRotationEntry[];
  /** Percent of the target's health burned by the end of the fight (0-100). */
  healthPercentBurned?: number;
  /** Absolute health at the end of the fight and at full; both -1 if the target never had health. */
  finalHealth?: number;
  totalHealth?: number;
  /** When the target was last active, in ms from fight start — its death, or the fight's end if it survived. */
  lastAware?: number;
}

export interface EiSkillMapEntry {
  name: string;
}

export interface EiRoot {
  fightName?: string;
  triggerID?: number;
  durationMS?: number;
  duration?: number;
  success: boolean;
  isCM?: boolean;
  phases: EiPhase[];
  mechanics: EiMechanic[];
  players: EiPlayer[];
  targets: EiTarget[];
  /** Keyed by e.g. "s65704" (an "s" prefix + the numeric skill id). */
  skillMap: Record<string, EiSkillMapEntry>;
  /**
   * When the fight actually started in-game, e.g. "2026-08-04 15:54:24
   * -04:00" — not ISO 8601 (space instead of "T", space before the UTC
   * offset). Use `parseEiTimestamp` below, not `new Date()` directly.
   */
  timeStartStd?: string;
}

/** Converts EI's non-ISO `timeStartStd` into a Date, or undefined if absent/unparseable. */
export function parseEiTimestamp(timeStartStd: string | undefined): Date | undefined {
  if (!timeStartStd) return undefined;
  const isoish = timeStartStd.replace(" ", "T").replace(" ", "");
  const date = new Date(isoish);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Raw mechanic name used to derive PhaseResult.playersAliveAtStart (ADR-009). */
export const DEATH_MECHANIC_NAME = "Dead";
