/**
 * "Invisible phase" mechanic: after Jormag/Primordus/Mordremoth, adds spawn
 * and one player casts "Mass Invisibility" to stealth the whole squad past
 * them; a player who attacks too early breaks stealth and gets the
 * "Revealed" debuff, making that intermission much harder to clear.
 *
 * Confirmed against a real Harvest Temple CM log (dps.report full JSON, not
 * the trimmed extraction subset):
 * - Skill id 10245 ("Mass Invisibility", per skillMap "s10245") appears in
 *   the caster's own `rotation` at the moment the squad goes invisible.
 * - Buff id 890 ("Revealed", per buffMap "b890") appears in each revealed
 *   player's `buffUptimesActive[].states` (a player-owned [time, presence
 *   0|1] timeline, not a per-source breakdown) as a transition to presence 1.
 * - On that log: invis cast at 93906ms, first reveal at 100499ms (+6.59s),
 *   second reveal at 100786ms (+6.88s) — matches the human-observed "first
 *   player revealed ~6.4s in, others ~1s later" pattern this config exists
 *   to capture.
 *
 * Neither skill id nor buff id is Harvest-Temple-specific in the game's own
 * skill/buff database (both are generic GW2 mechanics) — this config exists
 * per-boss because *treating* an invis-cast-to-reveal window as a trackable
 * mechanic is a Harvest Temple CM interpretation, not a generic one.
 *
 * Known gap: `context.causingSkill` on a REVEAL event (see persist-
 * encounter.ts's `findCausingSkill`) can be missing even when the player was
 * genuinely revealed by attacking — if the actual damage came from a pet,
 * phantasm, minion, or other summoned unit (Mesmer phantasms, Ranger pets,
 * Necromancer minions, Engineer turrets/gyros, some Revenant summons), that
 * hit has no timestamp anywhere in dps.report's JSON: not in any player's
 * `rotation` (only covers that player's own action-bar casts), not in
 * `targets[]` (hostile NPCs only), and not in `totalDamageDist` (has the
 * summoned skill's hit *count* per phase, but no individual timestamps —
 * confirmed on a real log: a Virtuoso's "Phantasmal Blade" reveal had 68
 * hits recorded for the whole fight with zero per-hit timing). In that case
 * `findCausingSkill` correctly returns nothing rather than attributing the
 * reveal to whatever the player's own rotation happened to be doing nearby
 * — the reveal event itself (player + timestamp) is still recorded
 * correctly, only the "which skill" detail is unavailable.
 */
export interface StealthPhaseConfig {
  /** Numeric skill id, matching `skillMap`'s "s<id>" key and `rotation[].id`. */
  invisSkillId: number;
  mechanicName: string;
  displayName: string;
  /** Numeric buff id, matching `buffMap`'s "b<id>" key and `buffUptimesActive[].id`. */
  revealBuffId: number;
  revealMechanicName: string;
  revealDisplayName: string;
  /**
   * How long the invisibility itself lasts once the cast finishes
   * channeling — after this, the buff has simply expired on its own, so a
   * later "Revealed" application can't be caused by (or even meaningfully
   * related to) this cast. Measured from `castTime + duration` (cast end),
   * not from `castTime` (cast start) — the channel itself (~1-1.5s observed)
   * delays when the buff actually applies.
   *
   * Deliberately trimmed below the buff's actual ~6000ms duration: a
   * "reveal" landing in that last half-second is unreliable — close enough
   * to the buff's own natural expiry that it's not clearly the player's
   * fault rather than the stealth simply running out, so it's excluded
   * rather than counted as a mistake.
   */
  stealthDurationMs: number;
  /**
   * Reveals within `groupRevealClusterGapMs` of each other (chained: each
   * consecutive gap in a sorted-by-time run, not a fixed window from the
   * first one) are one "burst". A burst with at least `groupRevealMinSize`
   * players is treated as an intentional squad-wide "attack now" call, not
   * mistakes — GW2 raid comms convention: the caller says go, several
   * players attack together, all breaking stealth within the same instant
   * by design. Those reveals are excluded entirely (no MechanicEvent
   * created) — this mechanic exists to catch individual early attacks, not
   * to flag the intended way the mechanic is supposed to end.
   *
   * Both constants are calibrated against two real logs: the one genuine
   * full-squad call observed had 7 players with every consecutive gap
   * ≤159ms; every genuine *isolated* mistake (4 separate cases, all only 1-2
   * players) had gaps of 287ms-5363ms. `groupRevealClusterGapMs` sits
   * between those (loose enough to always catch a real call, tight enough to
   * never merge unrelated isolated reveals into a false "burst");
   * `groupRevealMinSize` sits between the largest confirmed isolated case
   * (2) and the confirmed real call (7).
   */
  groupRevealClusterGapMs: number;
  groupRevealMinSize: number;
  /**
   * Max gap between a player's own skill cast and their reveal timestamp for
   * that cast to be attributed as the cause (see findCausingSkill in
   * persist-encounter.ts) — bounds how far back "the closest prior cast" is
   * allowed to reach before it's more likely coincidental than causal.
   *
   * Deliberately tight (not a generous margin): a player's `rotation` only
   * has THEIR OWN action-bar casts, not pet/phantasm/minion attacks (EI's
   * JSON has no per-hit timestamps for those anywhere — confirmed by
   * checking every player's rotation, `targets[]`, and the per-phase
   * `totalDamageDist` aggregate, which has the pet skill's hit *count* but
   * no individual timestamps). When the true cause is a pet/phantasm skill,
   * the closest *own* cast is coincidental, not causal — on two real logs,
   * every confirmed-correct match was 0-80ms away, while the two
   * confirmed-wrong ones (both a Virtuoso's untracked "Phantasmal Blade")
   * were 2300ms+ away. This tolerance sits well above the former and well
   * below the latter, so a too-far "closest cast" now correctly comes back
   * as "no cause found" instead of confidently guessing wrong.
   */
  causingSkillToleranceMs: number;
}

export const STEALTH_PHASES_BY_BOSS: Record<string, StealthPhaseConfig[]> = {
  // Harvest Temple CM (Dragon's End)
  "43488": [
    {
      invisSkillId: 10245,
      mechanicName: "Invis.Cast",
      displayName: "Mass Invisibility",
      revealBuffId: 890,
      revealMechanicName: "Revealed",
      revealDisplayName: "Aufgedeckt (Revealed)",
      stealthDurationMs: 5_500,
      groupRevealClusterGapMs: 250,
      groupRevealMinSize: 3,
      causingSkillToleranceMs: 500,
    },
  ],
};
