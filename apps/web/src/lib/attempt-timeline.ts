import type { Locale } from "@/i18n/locale";
import { isMainPhase } from "@/lib/main-phases";
import { translateMechanicName } from "@/lib/mechanic-names";
import {
  DOWNED_MECHANIC_NAME,
  downCauseConfig,
  isContextualNoiseMechanic,
  isNoiseMechanic,
} from "@/lib/mechanics";

// Everything the attempt timeline (components/attempt-timeline.tsx) draws,
// built from one encounter — shared by the batch page's attempt rows and the
// single-log page so both show the same markers.

export interface TimelineMechanicEvent {
  mechanicName: string;
  displayName: string;
  timeMs: number;
  context: unknown;
  playerResult: { characterName: string; account: string } | null;
}

export interface TimelineEncounter {
  bossId: string;
  durationMs: number;
  phaseResults: {
    name: string;
    order: number;
    reached: boolean;
    startMs: number;
    endMs: number;
    mechanicEvents: TimelineMechanicEvent[];
  }[];
}

export interface AttemptTimelineMechanic {
  timeMs: number;
  name: string;
  mechanicName: string;
  player: string | null;
  /** Only populated for stealth-phase events (see stealth-phases.ts on the worker) — currently just "Invis.Cast". */
  msSincePhaseEnd?: number;
  /** Only populated on "Revealed" events — time since the causing Mass-Invisibility cast's channel ended, not the phase end. */
  msSinceInvisCast?: number;
  /** Only populated on downstates: unavoidable mechanics that hit the player just before — see BossCuration.downCauses. */
  causes?: { name: string; count: number }[];
}

export interface AttemptTimelineData {
  bossId: string;
  durationMs: number;
  segments: { name: string; order: number; leftPct: number; widthPct: number }[];
  deaths: { timeMs: number; player: string | null }[];
  mechanics: AttemptTimelineMechanic[];
}

// Reads MechanicEvent.context.phaseEnd.msSincePhaseEnd (see stealth-phases.ts
// on the worker) without assuming the JSON shape — context is untyped JSON?
// in the schema, and only the stealth-phase events (currently just
// "Invis.Cast") populate this key at all.
function readMsSincePhaseEnd(context: unknown): number | undefined {
  if (!context || typeof context !== "object") return undefined;
  const phaseEnd = (context as Record<string, unknown>).phaseEnd;
  if (!phaseEnd || typeof phaseEnd !== "object") return undefined;
  const value = (phaseEnd as Record<string, unknown>).msSincePhaseEnd;
  return typeof value === "number" ? value : undefined;
}

// Reads MechanicEvent.context.msSinceInvisCast (see persist-encounter.ts on
// the worker) — only populated on "Revealed" events, measuring from the
// causing Mass-Invisibility cast's channel *end* (not its start, and not the
// dragon phase's end like `msSincePhaseEnd`).
function readMsSinceInvisCast(context: unknown): number | undefined {
  if (!context || typeof context !== "object") return undefined;
  const value = (context as Record<string, unknown>).msSinceInvisCast;
  return typeof value === "number" ? value : undefined;
}

/**
 * The unavoidable mechanics that put a player down: for a downstate, the
 * boss's `downCauses` mechanics that hit the same player in the window
 * before it, counted by name. Undefined for everything else, and when there
 * is nothing — see `BossCuration.downCauses`.
 */
function downCauses(
  encounter: TimelineEncounter,
  event: TimelineMechanicEvent,
  locale: Locale,
): { name: string; count: number }[] | undefined {
  if (event.mechanicName !== DOWNED_MECHANIC_NAME || !event.playerResult) return undefined;
  const config = downCauseConfig(encounter.bossId);
  if (!config) return undefined;
  const inWindow = (timeMs: number) =>
    timeMs <= event.timeMs && event.timeMs - timeMs <= config.windowMs;
  // Something else already explains this downstate (e.g. a failed Green).
  if (
    config.overriddenBy &&
    encounter.phaseResults.some((phase) =>
      phase.mechanicEvents.some(
        (other) => config.overriddenBy!.has(other.mechanicName) && inWindow(other.timeMs),
      ),
    )
  ) {
    return undefined;
  }
  const counts = new Map<string, { name: string; count: number }>();
  for (const phase of encounter.phaseResults) {
    for (const other of phase.mechanicEvents) {
      if (
        !config.mechanics.has(other.mechanicName) ||
        other.playerResult?.account !== event.playerResult.account ||
        !inWindow(other.timeMs)
      ) {
        continue;
      }
      const entry = counts.get(other.mechanicName) ?? {
        name: translateMechanicName(
          encounter.bossId,
          locale,
          other.mechanicName,
          other.displayName,
        ),
        count: 0,
      };
      entry.count += 1;
      counts.set(other.mechanicName, entry);
    }
  }
  return counts.size > 0 ? [...counts.values()] : undefined;
}

export function buildAttemptTimelineData(
  encounter: TimelineEncounter,
  locale: Locale,
): AttemptTimelineData {
  const reachedMainPhases = encounter.phaseResults.filter(
    (p) => p.reached && isMainPhase(encounter.bossId, p.name),
  );
  return {
    bossId: encounter.bossId,
    durationMs: encounter.durationMs,
    segments: reachedMainPhases.map((p) => ({
      name: p.name,
      order: p.order,
      leftPct: (p.startMs / encounter.durationMs) * 100,
      widthPct: ((p.endMs - p.startMs) / encounter.durationMs) * 100,
    })),
    // Deaths/mechanic fails are time markers, not phase-progression UI — keep
    // them from every phase result (including EI's auto-generated breakbar
    // sub-phases, where most mechanic-fail events actually get recorded),
    // unlike segments which are curated to main boss phases.
    deaths: encounter.phaseResults.flatMap((p) =>
      p.mechanicEvents
        .filter((m) => m.mechanicName === "Dead")
        .map((m) => ({ timeMs: m.timeMs, player: m.playerResult?.characterName ?? null })),
    ),
    mechanics: encounter.phaseResults.flatMap((p) =>
      p.mechanicEvents
        .filter(
          (m) =>
            m.mechanicName !== "Dead" &&
            !isNoiseMechanic(encounter.bossId, m.mechanicName) &&
            !isContextualNoiseMechanic(encounter.bossId, m, p.mechanicEvents),
        )
        .map((m) => ({
          timeMs: m.timeMs,
          name: translateMechanicName(encounter.bossId, locale, m.mechanicName, m.displayName),
          mechanicName: m.mechanicName,
          player: m.playerResult?.characterName ?? null,
          msSincePhaseEnd: readMsSincePhaseEnd(m.context),
          msSinceInvisCast: readMsSinceInvisCast(m.context),
          causes: downCauses(encounter, m, locale),
        })),
    ),
  };
}
