/**
 * Greens ("stack circles"): per wave, three circles spawn and each one needs
 * at least `minPlayers` squad members standing in it when it resolves — a
 * circle with fewer fails, and a failed wave downs the whole squad.
 *
 * EI represents every circle as its own fake target with a stable id and a
 * compass label in its name ("Jormag Green W", id -110), and reports each
 * resolution as a `S.Green` / `F.Green` mechanic event carrying that target's
 * id — this is what lets a failure be traced back to one specific circle.
 * Names depend on the recording client's language for real NPCs, so circles
 * are matched on `id` only (same rule as cast-markers.ts).
 *
 * Confirmed on 7 real logs (both kill runs included): every wave has exactly
 * three circles, the same three ids are reused wave after wave, and the
 * circle position drifts slightly between waves — the label, not the
 * coordinates, is the stable identity.
 */
export interface GreenTargetInfo {
  /** The boss whose greens these are — the role table is keyed by it. */
  boss: string;
  /** Compass label as in EI's target name ("W", "SE", "NW"). */
  label: string;
}

export interface GreensConfig {
  /** Raw EI mechanic names that mark a circle resolving. */
  successMechanic: string;
  failMechanic: string;
  /** Resolutions within this gap belong to the same wave. */
  waveGapMs: number;
  /**
   * A player counts as standing in a circle when they are within this many
   * EI map units of it. The circle's hitbox (180 inch ≈ 47 units) plus slack
   * for the 300ms position polling.
   */
  insideRadius: number;
  /** Players needed in a circle for it to hold. */
  minPlayers: number;
  /** Target id (EI `targets[].id`) → which circle that is. */
  targets: Record<number, GreenTargetInfo>;
}

export const GREENS_BY_BOSS: Record<string, GreensConfig> = {
  // Harvest Temple CM (Dragon's End)
  "43488": {
    successMechanic: "S.Green",
    failMechanic: "F.Green",
    waveGapMs: 3000,
    insideRadius: 50,
    minPlayers: 2,
    targets: {
      [-110]: { boss: "Jormag", label: "W" },
      [-111]: { boss: "Jormag", label: "E" },
      [-112]: { boss: "Jormag", label: "SE" },
      [-113]: { boss: "Primordus", label: "NW" },
      [-114]: { boss: "Primordus", label: "NE" },
      [-115]: { boss: "Primordus", label: "N" },
      [-116]: { boss: "Zhaitan", label: "NW" },
      [-117]: { boss: "Zhaitan", label: "NE" },
      [-118]: { boss: "Zhaitan", label: "S" },
      [-119]: { boss: "Soo-Won", label: "NE" },
      [-120]: { boss: "Soo-Won", label: "SE" },
      [-121]: { boss: "Soo-Won", label: "S" },
    },
  },
};
