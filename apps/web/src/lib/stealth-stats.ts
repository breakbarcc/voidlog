import { STEALTH_CAST_MECHANIC } from "./player-attempts";

/** Isolated early reveals during a stealth window (worker stealth-phases.ts). */
export const REVEAL_MECHANIC = "Revealed";

export interface StealthEvent {
  mechanicName: string;
  timeMs: number;
}

export interface RevealCount {
  /** Stealth windows: one per Mass Invisibility cast, whoever cast it. */
  windows: number;
  /** Of those, the ones in which anybody got revealed too early. */
  revealed: number;
  /** Reveal events in total (one per revealed player and window). */
  reveals: number;
}

/**
 * The squad's stealth windows in one encounter, counted like the Greens and
 * shockwaves: a window is failed as soon as anybody got revealed in it,
 * however many players it was. Pass all of the encounter's events.
 */
export function squadReveals(events: readonly StealthEvent[]): RevealCount {
  const casts = events
    .filter((e) => e.mechanicName === STEALTH_CAST_MECHANIC)
    .map((e) => e.timeMs)
    .sort((a, b) => a - b);
  // Reveals are only persisted inside a window, so each belongs to the latest
  // cast before it.
  const revealedCasts = new Set<number>();
  let reveals = 0;
  for (const e of events) {
    if (e.mechanicName !== REVEAL_MECHANIC) continue;
    reveals += 1;
    const cast = casts.findLast((t) => t <= e.timeMs);
    if (cast !== undefined) revealedCasts.add(cast);
  }
  return { windows: casts.length, revealed: revealedCasts.size, reveals };
}
