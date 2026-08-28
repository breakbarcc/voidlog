import type { Locale } from "@/i18n/locale";

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
   * Bespoke color for a phase by name (e.g. one hex per dragon) — return
   * undefined to fall through to the generic order-cycled palette.
   */
  phaseColor?: (order: number, phaseName: string) => string | undefined;
  /** Raw EI mechanic short code -> curated display name, per locale. */
  mechanicNames: Record<Locale, Record<string, string>>;
  /** Raw EI mechanic short codes that are noise (achievement/res spam), not real fails. */
  noiseMechanicNames: Set<string>;
  /** Synthetic "*.Cast" markers (see worker cast-markers.ts) individually curated with their own timeline icon in the UI. */
  visibleCastMarkers: Set<string>;
}
