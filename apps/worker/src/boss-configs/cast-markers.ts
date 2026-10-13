/**
 * Boss-ability casts synthesized as MechanicEvent rows independent of
 * whether any player actually got hit. EI's `mechanics[]` only records
 * *hits* (e.g. "Jaws.H" for Primordus's Jaws of Destruction) — a cast the
 * whole group dodged never appears there, so a "when does this attack
 * happen" timeline marker built from `mechanics[]` alone silently misses
 * casts (confirmed on a real Harvest Temple CM log: 2 actual Jaws casts,
 * only 1 corresponding "Jaws.H" hit).
 *
 * `targets[].rotation` (EI's per-target cast log, keyed by skill id) has
 * every cast regardless of outcome — that's the source here.
 *
 * Targets are matched by `EiTarget.id` (a stable per-species id), NOT by
 * `name` — `name` is localized to the recording client's game-client
 * language. Confirmed on two real logs: a German-client recording names
 * the giants "Riese der Leere 1/2/3" and the Time Caster "Zeitzauberer der
 * Leere"; an English-client recording of the same encounter names them
 * "Void Giant 1/2/3" and "Void Time Caster" — both share the same `id`s
 * (24450 for all three giants, 25025 for the Time Caster). Matching by
 * name alone would silently drop all cast data for non-German clients.
 *
 * Two layers:
 * - `CURATED_CAST_MARKERS_BY_BOSS`: individually named/relevant attacks,
 *   shown as distinct timeline ticks in the UI (see batch-attempts.tsx).
 * - `CAST_TARGET_GROUPS_BY_BOSS`: every *other* rotation skill for these
 *   targets is captured too (generic "<group>.Cast.<skillId>" name, skill
 *   name from `skillMap`), so the data already exists for later analysis
 *   even before it's individually curated. Not surfaced in the UI yet
 *   (see `isNoiseMechanic` on the web side).
 *
 * Known gap: Soo-Won CM's "Void Obliterator"/"Void Goliath" adds aren't
 * covered yet — no sample log reaching that deep into the encounter was
 * available to confirm their target ids.
 */
export interface CuratedCastMarker {
  /** Matched against EiTarget.id (stable, language-independent — see header). */
  targetId: number;
  /** Numeric skill id, matching `skillMap`'s "s<id>" key and `rotation[].id`. */
  skillId: number;
  /** MechanicEvent.mechanicName — reuses the boss's existing ".H" hit-mechanic stem with a ".Cast" suffix, so it reads consistently with the rest of mechanic-names.ts. */
  mechanicName: string;
  displayName: string;
}

export const CURATED_CAST_MARKERS_BY_BOSS: Record<string, CuratedCastMarker[]> = {
  // Harvest Temple CM (Dragon's End)
  "43488": [
    {
      targetId: -22, // The PrimordusVoid
      skillId: 65704,
      mechanicName: "Jaws.Cast",
      displayName: "Jaws of Destruction (Cast)",
    },
    {
      targetId: -22, // The PrimordusVoid
      skillId: 65427,
      mechanicName: "Slam.Cast",
      displayName: "Lava Slam (Cast)",
    },
    {
      targetId: -19, // The KralkatorrikVoid
      skillId: 65017,
      mechanicName: "Beam.Cast",
      displayName: "Branding Beam (Cast)",
    },
    {
      targetId: -20, // The MordremothVoid
      skillId: 64810,
      mechanicName: "ShckWv.Cast",
      displayName: "Mordremoth Shockwave (Cast)",
    },
    {
      targetId: -17, // The ZhaitanVoid
      skillId: 64428,
      mechanicName: "Scream.Cast",
      displayName: "Zhaitan Scream (Cast)",
    },
    {
      targetId: -18, // The SooWonVoid
      skillId: 63588,
      mechanicName: "ClawSlap.Cast",
      displayName: "Claw Slap (Cast)",
    },
  ],
};

export interface CastTargetGroup {
  /** Used to build the generic mechanicName: "<groupKey>.Cast.<skillId>". */
  groupKey: string;
  /**
   * Target ids merged into this one group — a single id can already cover
   * multiple simultaneous instances (e.g. all three giants share id
   * 24450), so this is mainly for the rare case of genuinely distinct
   * species that should still be tracked as one group.
   */
  targetIds: number[];
}

export const CAST_TARGET_GROUPS_BY_BOSS: Record<string, CastTargetGroup[]> = {
  "43488": [
    { groupKey: "Jormag", targetIds: [-21] },
    { groupKey: "Primordus", targetIds: [-22] },
    { groupKey: "Kralkatorrik", targetIds: [-19] },
    { groupKey: "Mordremoth", targetIds: [-20] },
    { groupKey: "Zhaitan", targetIds: [-17] },
    { groupKey: "SooWon", targetIds: [-18] },
    { groupKey: "TimeCaster", targetIds: [25025] },
    { groupKey: "Giant", targetIds: [24450] },
    { groupKey: "SaltsprayDragon", targetIds: [23846] },
  ],
};

/** EI's synthetic "target became active" marker, not a real attack. */
export const EXCLUDED_ROTATION_SKILL_IDS = new Set([-2]);

/**
 * Hazard-occurrence markers for mechanics that aren't a boss ability cast at
 * all (e.g. Harvest Temple's "Greens" stack circles) — synthesized from the
 * timing of an existing raw EI mechanic instead, by clustering its
 * `mechanicsData` points that land within `clusterGapMs` of each other into
 * one marker per real-world occurrence.
 *
 * This exists because the more obvious source — `EiTarget.firstAware` on
 * the fake "Jormag Green E"-style actors EI represents each stack circle
 * as — only reflects the *first* time that fake actor is used. Confirmed on
 * a real log: Primordus's Greens fired 4 times total (raw S.Green/F.Green
 * timestamps ~40-55s apart), reusing the same 3 actors instead of creating
 * new ones each time, so `firstAware` only ever produced 1-2 markers total
 * — most occurrences were silently missing from the timeline. The
 * S.Green/F.Green mechanic itself fires every time (that's what resolves
 * each stack attempt pass/fail), so clustering *those* timestamps instead
 * captures every occurrence. `clusterGapMs` just needs to be comfortably
 * between "actors resolving the same wave" (observed ~0-2ms apart) and
 * "distinct waves" (observed 40s+ apart) — not tied to real spawn/resolve
 * timing, since only the resolution moment is available, not the true
 * spawn instant.
 */
export interface ClusterSpawnMarker {
  /** Raw EI mechanicName(s) whose mechanicsData timestamps mark this occurrence. */
  sourceMechanicNames: string[];
  clusterGapMs: number;
  mechanicName: string;
  displayName: string;
}

export const CLUSTER_SPAWN_MARKERS_BY_BOSS: Record<string, ClusterSpawnMarker[]> = {
  // Harvest Temple CM (Dragon's End) — only Jormag, Primordus, and Zhaitan
  // have this mechanic, confirmed absent for Kralkatorrik/Mordremoth/
  // Soo-Won on a log that reached past all of them.
  "43488": [
    {
      sourceMechanicNames: ["S.Green", "F.Green"],
      clusterGapMs: 3000,
      mechanicName: "Green.Spawn",
      displayName: "Green Circles",
    },
  ],
};
