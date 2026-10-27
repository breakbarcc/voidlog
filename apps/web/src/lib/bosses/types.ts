import type { Locale } from "@/i18n/locale";

export interface ShockwaveConfig {
  /** Synthesized boss cast marker (worker cast-markers.ts) — one event per shockwave. */
  castMechanic: string;
  /** Raw EI mechanic of a player being hit. One cast may produce several of these. */
  hitMechanic: string;
  /**
   * A hit belongs to the latest cast at most this long before it. Must stay
   * below the shortest gap between two casts so hits cannot be assigned to
   * the wrong one.
   */
  hitWindowMs: number;
}

export interface ChompsConfig {
  /** Raw EI mechanic of a player hit by the instant-kill Slam ("Primordus Chomps"). */
  slamHit: string;
  /** Raw EI mechanic of a player hit by the Jaws, which sometimes kills as well. */
  jawsHit: string;
  /**
   * Synthetic boss cast markers (worker cast-markers.ts), one per Slam / Jaws
   * cast — an attempt only "had" the mechanic if one was cast. A hit belongs
   * to the latest cast of its attack before it.
   */
  slamCast: string;
  jawsCast: string;
}

export interface GreensConfig {
  /** Synthetic marker (worker cast-markers.ts) — one event per Greens cast. */
  castMechanic: string;
  /** Raw EI mechanic of a player failing a Green. */
  failMechanic: string;
  /** A fail belongs to the cast whose marker is at most this far from it. */
  windowMs: number;
  /**
   * Who is meant to stand in which circle: circle label ("W", "SE", ...) → role
   * name, per Greens phase as the worker records it (`context.green.phase`:
   * the boss, with Soo-Won split into "Soo-Won 1"/"Soo-Won 2"). Fixed per
   * phase, independent of the wave number.
   */
  roles?: Record<string, Record<string, string>>;
}

/**
 * Everything hand-curated about a single boss encounter, in one place.
 * One file per boss (see harvest-temple.ts) instead of one file per
 * *concern* (phases, mechanic names, colors, ...) — the old layout meant
 * every curated boss added more entries to the same handful of giant flat
 * `Record<string, X>` maps, keyed by raw phase/mechanic names that aren't
 * guaranteed unique across encounters (e.g. Cerus has phases literally
 * named "Phase 1"/"Split 1" — generic enough to collide with another
 * boss's phases of the same name). Consumers (main-phases.ts,
 * mechanic-names.ts, mechanics.ts, phase-badge.tsx) stay boss-agnostic
 * thin wrappers that look up the right BossCuration by bossId first.
 */
export interface BossCuration {
  /** EI's `triggerID`, stringified — matches EncounterResult.bossId. */
  bossId: string;
  /**
   * True if `phaseName` counts as one of this boss's main progression
   * phases — used to filter EI's auto-generated breakbar/CM sub-phases out
   * of aggregate/summary views. A function (not just a name list) so a
   * boss can match by prefix too (e.g. HTCM's numbered "Purification N"
   * intermissions).
   */
  isMainPhase: (phaseName: string) => boolean;
  /**
   * True for main phases that are intermissions rather than the boss
   * fight itself (e.g. HTCM's Purification/Giants) — views draw them
   * muted. Omitted = every phase counts as a fight phase.
   */
  isTransitionPhase?: (phaseName: string) => boolean;
  /**
   * Every main phase of the encounter in fight order, including the ones
   * nobody reached. Persisted PhaseResult rows only exist for phases an
   * attempt got to, so views that must show the *whole* progression (e.g. the
   * phase progress chart) need this list. Omitted = only observed phases.
   */
  progressPhases?: readonly string[];
  /**
   * The phases whose damage numbers are comparable between nights — the ones
   * where the group can actually hurt the boss, in fight order. Intermissions
   * with an invulnerable target are left out, they would only add noise.
   * Omitted = no per-phase damage view for this boss.
   */
  damagePhases?: readonly string[];
  /**
   * The boss's shockwave mechanic, counted per shockwave (see
   * lib/shockwave-stats.ts). Omitted = no shockwave statistics for this boss.
   */
  shockwave?: ShockwaveConfig;
  /**
   * The boss's one-hit-kill attacks, counted per player (see
   * lib/chomp-stats.ts). Omitted = no chomp statistics for this boss.
   */
  chomps?: ChompsConfig;
  /**
   * The squad roles players can be assigned in the rosters for this boss
   * (lib/player-roles.ts). Omitted = no role assignment for this boss.
   */
  squadRoles?: readonly string[];
  /**
   * The bosses the encounter's fight is made of, in fight order, for the
   * "defeated" counts (lib/project-summary.ts). `phase` is the boss's last
   * `progressPhases` entry: it counts as defeated once a later progress
   * phase was reached, or the attempt was a kill. Omitted = no such counts.
   */
  defeatableBosses?: readonly { name: string; phase: string }[];
  /**
   * The boss's Greens mechanic, counted per cast (see lib/green-stats.ts).
   * Omitted = no Greens statistics for this boss.
   */
  greens?: GreensConfig;
  /**
   * Whether the remaining boss health recorded for an attempt that ended in
   * `phaseName` is worth showing. The worker stores the health of the last
   * enemy that had any, which only describes the fight when that enemy is
   * what the group was actually fighting — not during an intermission whose
   * target is invulnerable, where it is merely the previous boss's leftover.
   * Omitted = always show.
   */
  showsBossHealth?: (phaseName: string) => boolean;
  /**
   * Bespoke color for a phase by name (e.g. one hex per dragon) — return
   * undefined to fall through to the generic order-cycled palette.
   */
  phaseColor?: (order: number, phaseName: string) => string | undefined;
  /** Raw EI mechanic short code -> curated display name, per locale. */
  mechanicNames: Record<Locale, Record<string, string>>;
  /** Raw EI mechanic short codes that are noise (achievement/res spam), not real fails. */
  noiseMechanicNames: Set<string>;
  /**
   * Noise names that other logic still reads — e.g. as the context
   * `isContextualNoise` looks at. Everything else in `noiseMechanicNames`
   * is never used by any view, so queries leave it out of the database read
   * (see lib/mechanics.ts `unusedMechanicNames`).
   */
  noiseNamesStillRead?: ReadonlySet<string>;
  /**
   * Unavoidable mechanics that are noise on their own (so listed in
   * `noiseMechanicNames` and never shown or counted as fails) but are named
   * in the tooltip of a downstate of the same player that follows them within
   * `windowMs` — they are what put the player down. Must also be in
   * `noiseNamesStillRead`, the tooltip needs the events.
   */
  downCauses?: {
    mechanics: ReadonlySet<string>;
    windowMs: number;
    /**
     * Mechanics that explain a downstate on their own: when one of them
     * (from any player) happened in the same window, the downstate is theirs
     * and `mechanics` are not named as its cause.
     */
    overriddenBy?: ReadonlySet<string>;
  };
  /** Synthetic "*.Cast" markers (see worker cast-markers.ts) individually curated with their own timeline icon in the UI. */
  visibleCastMarkers: Set<string>;
  /**
   * Whether `event` is noise given the *surrounding* mechanic events of the
   * same encounter — for a mechanic that's only unconditionally unavoidable
   * near a specific other mechanic (e.g. a debuff auto-applied a moment
   * after a specific boss cast), but should still count as a genuine fail
   * everywhere else it occurs. Checked in *addition* to `noiseMechanicNames`,
   * not instead of it — that set stays for mechanics that are always noise
   * regardless of context.
   */
  isContextualNoise?: (
    event: { mechanicName: string; timeMs: number },
    allEvents: { mechanicName: string; timeMs: number }[],
  ) => boolean;
}
