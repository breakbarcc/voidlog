/**
 * Stacks of a buff on a boss-side target, kept as one summary event per
 * target. Harvest Temple CM's Void Hearts gain "Void Empowerment" whenever
 * a Purification isn't finished in time, and that decides the "Voidwalker"
 * achievement (and title).
 *
 * Confirmed on a real kill log (08.11.2026, 20:32:54): Heart 2 reached its
 * 3rd stack at 302672ms and, at that exact millisecond, every player still
 * holding "Achievement Eligibility: Voidwalker" (buff 68066) lost it — so 2
 * stacks are allowed and reaching the 3rd fails it, although the
 * achievement text reads "no more than 3". Hearts 1 and 3 stopped at 2
 * stacks on the same log without costing anything. The eligibility buff
 * itself can't be used instead: the game only gives it to players who don't
 * own the achievement yet, so it says nothing for everybody else.
 *
 * Heart 1-3 share EI's fake id -23 (numbered by their order in `targets`);
 * Heart 4 is a real NPC (23956) that never gets the buff. Matched on id,
 * never on the localized name (see cast-markers.ts).
 */
export interface TargetBuffStacksConfig {
  /** EI `targets[].id`s whose stacks are read. */
  targetIds: readonly number[];
  /** Numeric buff id, matching `buffMap`'s "b<id>" key and `targets[].buffs[].id`. */
  buffId: number;
  /** One event of this name per matching target, context `TargetBuffStacksContext`. */
  mechanicName: string;
  displayName: string;
}

/** `context` of a target-buff-stacks event. */
export interface TargetBuffStacksContext {
  /** 1-based number of the target among those with the same id, in EI's order ("Heart 2" → 2). */
  ordinal: number;
  /** Highest stack count the target reached; 0 if it never got the buff. */
  maxStacks: number;
  /** When each stack was first reached: `[0]` is the 1st stack, `[2]` the 3rd. */
  stackTimesMs: number[];
}

export const TARGET_BUFF_STACKS_BY_BOSS: Record<string, readonly TargetBuffStacksConfig[]> = {
  "43488": [
    {
      targetIds: [-23],
      buffId: 68083,
      mechanicName: "Heart.Empowerment",
      displayName: "Void Empowerment",
    },
  ],
};

/** Every target id any config of `bossId` reads buffs from. */
export function buffStackTargetIds(bossId: string): Set<number> {
  return new Set((TARGET_BUFF_STACKS_BY_BOSS[bossId] ?? []).flatMap((c) => c.targetIds));
}

/**
 * Turns a buff's `[timeMs, stacks]` timeline into the summary context —
 * stacks can jump by more than one at once, each level gets the same time.
 */
export function stacksContext(
  ordinal: number,
  states: readonly (readonly [number, number])[],
): TargetBuffStacksContext {
  const stackTimesMs: number[] = [];
  for (const [timeMs, stacks] of states) {
    while (stackTimesMs.length < stacks) stackTimesMs.push(timeMs);
  }
  return { ordinal, maxStacks: stackTimesMs.length, stackTimesMs };
}

/** The summary events of one encounter (see the persist step), before phase resolution. */
export function targetBuffStackEvents(
  bossId: string,
  targets: readonly {
    id: number;
    lastAware?: number;
    buffs?: { id: number; states: [number, number][] }[];
  }[],
): {
  mechanicName: string;
  displayName: string;
  timeMs: number;
  context: TargetBuffStacksContext;
}[] {
  const events = [];
  for (const config of TARGET_BUFF_STACKS_BY_BOSS[bossId] ?? []) {
    const ordinals = new Map<number, number>();
    for (const target of targets) {
      if (!config.targetIds.includes(target.id)) continue;
      const ordinal = (ordinals.get(target.id) ?? 0) + 1;
      ordinals.set(target.id, ordinal);
      const states = target.buffs?.find((b) => b.id === config.buffId)?.states ?? [];
      const context = stacksContext(ordinal, states);
      events.push({
        mechanicName: config.mechanicName,
        displayName: config.displayName,
        // When the last stack landed; a target without any at its end.
        timeMs: Math.round(context.stackTimesMs.at(-1) ?? target.lastAware ?? 0),
        context,
      });
    }
  }
  return events;
}
